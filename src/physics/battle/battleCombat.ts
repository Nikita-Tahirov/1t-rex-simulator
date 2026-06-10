/**
 * Боевая модель PvP: управление спиннером, нанесение урона тараном и спиннером,
 * перенос урона «атакующий → жертва». Чистые функции (тестируются) + небольшой
 * module-state накопителя нанесённого урона (как `battleRobotRegistry`).
 *
 * Принцип: урон НАНОСИТ атакующий (он надёжно детектит контакт со своей стороны),
 * а ПРИМЕНЯЕТ к своему HP жертва — по дельте накопительного счётчика. Это чинит
 * асимметрию интерполяции (стоящая жертва раньше не «видела» удар) и переживает
 * потери пакетов: важно лишь последнее значение счётчика, а не каждый инкремент.
 */

import { ROBOT } from '../constants.ts';
import { computeImpactDamageDelta } from '../robotDamage.ts';

/** Максимальные обороты спиннера (как в одиночке). */
export const SPINNER_MAX_RPM = ROBOT.spinnerMaxRpm;
/** Разгон спиннера по клавише R, об/мин в секунду (как в одиночке). */
export const SPINNER_SPINUP_RPM_PER_S = 800;
/** Торможение спиннера по клавише F / при простое, об/мин в секунду. */
export const SPINNER_SPINDOWN_RPM_PER_S = 1500;
/** Ниже этих оборотов спиннер не наносит урона. */
export const SPINNER_ACTIVE_RPM = 1500;
/** Дальность поражения спиннером (центр-центр), м. Чуть больше радиуса расталкивания. */
export const SPINNER_REACH_M = 1.4;
/** Косинус полу-угла фронтального сектора спиннера (≈ ±78° от носа). */
export const SPINNER_FRONT_DOT = 0.2;
/** Базовый урон спиннера за тик-удар при максимальных оборотах. */
export const SPINNER_DAMAGE_PER_HIT = 52;
/** Дальность тарана (центр-центр), м. */
export const RAM_REACH_M = 1.05;
/** Минимальная скорость сближения для урона тараном, м/с. */
export const RAM_MIN_APPROACH_MPS = 1.0;
/** Кулдаун между двумя ударами одного источника по одной жертве, мс. */
export const PVP_HIT_COOLDOWN_MS = 280;

export interface CombatPose {
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

/** Минимум для позиционной цели (соперник): координаты на плоскости. */
export interface Point {
  x: number;
  z: number;
}

/** Шаг оборотов спиннера: R разгоняет, F тормозит, иначе держит. Кинематически. */
export function stepSpinnerRpm(rpm: number, up: boolean, down: boolean, dt: number): number {
  if (up) return Math.min(SPINNER_MAX_RPM, rpm + SPINNER_SPINUP_RPM_PER_S * dt);
  if (down) return Math.max(0, rpm - SPINNER_SPINDOWN_RPM_PER_S * dt);
  return rpm;
}

/** Пассивное затухание оборотов (вне боя/после смерти), об/мин. */
export function decaySpinnerRpm(rpm: number, dt: number): number {
  return Math.max(0, rpm - SPINNER_SPINDOWN_RPM_PER_S * dt);
}

/**
 * Скорость СБЛИЖЕНИЯ самого атакующего к сопернику (проекция собственной скорости
 * на направление к цели), м/с. В отличие от симметричной closingSpeed зависит
 * только от движения атакующего: стоящий робот не «таранит» и не бьёт сам себя.
 */
export function approachSpeed(self: CombatPose, other: Point): number {
  const myVx = Math.cos(self.yaw) * self.speed;
  const myVz = Math.sin(self.yaw) * self.speed;
  const dirX = other.x - self.x;
  const dirZ = other.z - self.z;
  const dist = Math.hypot(dirX, dirZ);
  if (dist < 1e-6) return Math.max(0, self.speed);
  return Math.max(0, (myVx * dirX + myVz * dirZ) / dist);
}

/** Косинус угла между носом атакующего и направлением на цель (фронт спиннера). */
export function frontDot(self: CombatPose, other: Point): number {
  const dirX = other.x - self.x;
  const dirZ = other.z - self.z;
  const dist = Math.hypot(dirX, dirZ);
  if (dist < 1e-6) return 1;
  return (Math.cos(self.yaw) * dirX + Math.sin(self.yaw) * dirZ) / dist;
}

/** Урон тарана по скорости сближения атакующего (переиспользует impact-модель). */
export function ramDamage(approachMps: number): number {
  if (approachMps <= RAM_MIN_APPROACH_MPS) return 0;
  return computeImpactDamageDelta({ speedMps: approachMps }).damage;
}

/** Урон спиннера за удар, пропорционально оборотам (0, если ниже порога). */
export function spinnerDamage(rpm: number): number {
  if (rpm < SPINNER_ACTIVE_RPM) return 0;
  return SPINNER_DAMAGE_PER_HIT * Math.min(1, rpm / SPINNER_MAX_RPM);
}

// --- Накопитель нанесённого урона (только локальный робот пишет сюда) ---

const localDealt = new Map<string, number>();

/** Добавляет нанесённый урон сопернику (накопительно). */
export function addDealtDamage(victimUid: string, amount: number): void {
  if (!(amount > 0)) return;
  localDealt.set(victimUid, (localDealt.get(victimUid) ?? 0) + amount);
}

/** Снимок накопителя для публикации (целые числа, только ненулевые). */
export function dealtRecord(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [uid, value] of localDealt) {
    if (value > 0) out[uid] = Math.round(value);
  }
  return out;
}

/** Сброс накопителя (на старте/рематче матча). */
export function resetDealtDamage(): void {
  localDealt.clear();
}

/**
 * Новая порция урона, которую жертве надо применить, и обновлённый базис.
 * `applied` = последнее учтённое накопительное значение от этого атакующего
 * (undefined = первое наблюдение → только базис, без ретро-урона). Падение
 * `observed` ниже базиса = рестарт матча → новый базис без урона.
 */
export function incomingDelta(
  observed: number,
  applied: number | undefined,
): { delta: number; next: number } {
  if (applied === undefined || observed <= applied) return { delta: 0, next: observed };
  return { delta: observed - applied, next: observed };
}

/**
 * Наносит melee-урон (таран + спиннер) соперникам в досягаемости за один кадр и
 * копит его через {@link addDealtDamage}. `poses`/`uids` — параллельные массивы
 * живых соперников (без аллокаций в hot-path). Кулдауны per-victim хранятся в
 * переданных Map. Таран — по своей скорости сближения; спиннер — во фронтальном
 * секторе при активных оборотах. Чистая по отношению к аргументам (трогает лишь
 * накопитель и переданные Map), поэтому тестируется детерминированно.
 */
export function dealMeleeDamage(
  self: CombatPose,
  poses: readonly Point[],
  uids: readonly string[],
  rpm: number,
  now: number,
  lastRamAt: Map<string, number>,
  lastSpinAt: Map<string, number>,
): void {
  for (let i = 0; i < poses.length; i += 1) {
    const target = poses[i]!;
    const vid = uids[i]!;
    const dist = Math.hypot(target.x - self.x, target.z - self.z);
    if (dist <= RAM_REACH_M) {
      const dmg = ramDamage(approachSpeed(self, target));
      if (dmg > 0 && now - (lastRamAt.get(vid) ?? -Infinity) >= PVP_HIT_COOLDOWN_MS) {
        addDealtDamage(vid, dmg);
        lastRamAt.set(vid, now);
      }
    }
    if (
      dist <= SPINNER_REACH_M &&
      rpm >= SPINNER_ACTIVE_RPM &&
      frontDot(self, target) > SPINNER_FRONT_DOT
    ) {
      const dmg = spinnerDamage(rpm);
      if (dmg > 0 && now - (lastSpinAt.get(vid) ?? -Infinity) >= PVP_HIT_COOLDOWN_MS) {
        addDealtDamage(vid, dmg);
        lastSpinAt.set(vid, now);
      }
    }
  }
}

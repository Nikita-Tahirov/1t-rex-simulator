/**
 * Хелперы автопилота сценариев.
 *
 * Pilot-функция сценария вызывается каждый physics-кадр и должна записать
 * `ctx.setPilotInput({ active: true, throttle, turn, brake })`. Эти утилиты
 * вычисляют PD-управление по точке-цели в плоскости (x, z).
 *
 * **Соглашения**:
 *   • Forward = `+X` (см. `physics/constants.ts`).
 *   • `yaw = 0` ↔ робот смотрит в `+X`. Поворот по часовой = `yaw > 0`.
 *   • `throttle ∈ [-1, 1]`, `turn ∈ [-1, 1]`, `brake ∈ [0, 1]` (1 = свободно).
 *
 * **Где использовать**: только в pilot-функциях сценариев. Эти helper-ы НЕ
 * читают `useSimStore`/`useScenarioStore` напрямую — пишут команды через ctx,
 * чтобы оставаться чистым TS и тестируемыми без R3F.
 *
 * @example
 *   pilot: (ctx) => {
 *     goToTarget(ctx, { targetX: 3, targetZ: 0, cruiseThrottle: 0.7 });
 *   }
 */

import { clamp } from '@/lib/math.ts';
import type { ScenarioContext } from './manager.ts';

/** Нормализация угла в `(-π, π]`. */
export function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

export interface GoToParams {
  /** Координаты цели в мире (м). */
  targetX: number;
  targetZ: number;
  /** Радиус «прибыли». При distance < arriveRadius → throttle=0. */
  arriveRadius?: number;
  /** Максимальный throttle на дальних дистанциях. */
  cruiseThrottle?: number;
  /** Множитель P-управления по yaw. */
  turnGain?: number;
  /** При |yaw_err| > этого порога — сбавить ход (выравниваем сначала). */
  yawErrThrottleCut?: number;
  /** Минимальный throttle при движении (чтобы робот не «застревал»). */
  minMoveThrottle?: number;
}

/**
 * Вычислить и применить throttle/turn для движения к точке-цели.
 *
 * Алгоритм:
 *   1. heading = atan2(target.z − robot.z, target.x − robot.x).
 *   2. yaw_err = wrap(heading − robot.yaw).
 *   3. turn = clamp(turnGain · yaw_err, −1, 1).
 *   4. throttle = cruiseThrottle, но снижается при большой ошибке по углу
 *      (сначала выравниваемся) и при близкой цели (плавная остановка).
 *
 * Использует `+X = forward` соглашение Robot.tsx (см. constants.ts).
 */
export function goToTarget(
  ctx: ScenarioContext,
  p: GoToParams,
): { distance: number; yawErr: number } {
  const arriveRadius = p.arriveRadius ?? 0.4;
  const cruiseThrottle = p.cruiseThrottle ?? 0.7;
  const turnGain = p.turnGain ?? 1.5;
  const yawErrThrottleCut = p.yawErrThrottleCut ?? 0.5;
  const minMoveThrottle = p.minMoveThrottle ?? 0.25;

  const tel = ctx.telemetry;
  const dx = p.targetX - tel.positionX;
  const dz = p.targetZ - tel.positionZ;
  const distance = Math.hypot(dx, dz);
  const heading = Math.atan2(dz, dx);
  const yawErr = wrapPi(heading - tel.yaw);

  // Если уже у цели — стоп.
  if (distance < arriveRadius) {
    ctx.setPilotInput({ active: true, throttle: 0, turn: 0, brake: 1 });
    return { distance, yawErr };
  }

  const turn = clamp(yawErr * turnGain, -1, 1);
  // Снижаем throttle пропорционально |yawErr| (если сильно мимо — поворачиваем
  // сначала, потом едем).
  const yawAttenuation = Math.max(0, 1 - Math.abs(yawErr) / yawErrThrottleCut);
  let throttle = cruiseThrottle * yawAttenuation;
  // Если близко к цели — медленнее.
  const distAttenuation = clamp(distance / 1.5, 0, 1);
  throttle *= distAttenuation;
  // Не давай застрять при сильной yaw-ошибке.
  if (Math.abs(yawErr) < Math.PI / 2 && throttle < minMoveThrottle) {
    throttle = minMoveThrottle;
  }
  // Если назад смотрим (|yawErr| > π/2) — сначала разворот без газа.
  if (Math.abs(yawErr) > Math.PI / 2) {
    throttle = 0;
  }

  ctx.setPilotInput({
    active: true,
    throttle: clamp(throttle, -1, 1),
    turn,
    brake: 1,
  });
  return { distance, yawErr };
}

/** Команда «стоять». */
export function pilotIdle(ctx: ScenarioContext): void {
  ctx.setPilotInput({ active: true, throttle: 0, turn: 0, brake: 0 });
}

/** Команда «ехать вперёд» с заданной скоростью и поворотом. */
export function pilotDrive(ctx: ScenarioContext, throttle: number, turn: number): void {
  ctx.setPilotInput({
    active: true,
    throttle: clamp(throttle, -1, 1),
    turn: clamp(turn, -1, 1),
    brake: 1,
  });
}

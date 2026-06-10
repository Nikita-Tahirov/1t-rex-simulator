/**
 * Реестр текущих поз боевых роботов (module-level, как `sharedRefs` для одиночки).
 *
 * Локальный робот пишет сюда свою полную позу каждый кадр; хук интерполяции —
 * позы соперников. Локальный контроллер читает чужие записи для урона; удалённое
 * динамическое тело — для следования. Поза ПОЛНАЯ 3D (высота + кватернион
 * ориентации + скорости), чтобы синхронизировать опрокидывание/подброс и плавно
 * интерполировать. Обновления in-place через переиспользуемый scratch — без
 * аллокаций в hot-path (инвариант проекта).
 */

export interface BattlePose {
  x: number;
  y: number;
  z: number;
  /** Рыскание, рад — для 2D-логики (фронт-сектор спиннера) и kinematic-визуала. */
  yaw: number;
  /** Полная ориентация тела (кватернион) — для опрокидывания удалённого тела. */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Скорость вдоль носа, м/с — для расчёта урона/эффектов. */
  speed: number;
  /** Компоненты линейной скорости, м/с — для экстраполяции/feedforward следования. */
  vx: number;
  vz: number;
  /** Обороты спиннера, об/мин — для визуального вращения ротора призрака. */
  spinnerRpm: number;
  alive: boolean;
}

export const battlePoses = new Map<string, BattlePose>();

/** Копирует полную позу `src` в реестр (in-place, без аллокаций; `src` — scratch). */
export function setBattlePose(uid: string, src: BattlePose): void {
  const existing = battlePoses.get(uid);
  if (existing) {
    existing.x = src.x;
    existing.y = src.y;
    existing.z = src.z;
    existing.yaw = src.yaw;
    existing.qx = src.qx;
    existing.qy = src.qy;
    existing.qz = src.qz;
    existing.qw = src.qw;
    existing.speed = src.speed;
    existing.vx = src.vx;
    existing.vz = src.vz;
    existing.spinnerRpm = src.spinnerRpm;
    existing.alive = src.alive;
  } else {
    battlePoses.set(uid, { ...src });
  }
}

/** Кватернион поворота вокруг Y на «наш» yaw (rotation.y = −yaw) — для 2D-поз. */
export function yawToQuat(yaw: number, out: BattlePose): void {
  const half = -yaw / 2;
  out.qx = 0;
  out.qy = Math.sin(half);
  out.qz = 0;
  out.qw = Math.cos(half);
}

/** Создаёт нулевую полную позу (для scratch-объектов и спавна). */
export function makeBattlePose(x = 0, z = 0, yaw = 0, y = 0, alive = true): BattlePose {
  const pose: BattlePose = {
    x,
    y,
    z,
    yaw,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    speed: 0,
    vx: 0,
    vz: 0,
    spinnerRpm: 0,
    alive,
  };
  yawToQuat(yaw, pose);
  return pose;
}

export function removeBattlePose(uid: string): void {
  battlePoses.delete(uid);
}

export function clearBattlePoses(): void {
  battlePoses.clear();
}

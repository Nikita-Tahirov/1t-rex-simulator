import { ROBOT } from '../constants.ts';

/**
 * Общие константы/хелперы динамических боевых тел (локального и удалённого).
 */

// Габариты коллайдера шасси (половинные). Чуть крупнее голого шасси, чтобы
// покрыть клинья/габарит визуальной модели (меньше визуального «протыкания»),
// и чуть ниже центра — низкий ЦМ для устойчивости.
export const CHASSIS_HALF = [0.54, 0.16, 0.46] as const;
export const CHASSIS_COLLIDER_Y = -0.04;
export const CHASSIS_MASS = ROBOT.chassisMass;
/** Кламп шага кадра в hot-path (мобила может падать до ~30 FPS). */
export const MAX_DT = 1 / 30;

/** Кватернион поворота тела так, чтобы локальный +X смотрел по «нашему» yaw. */
export function yawQuat(yaw: number): [number, number, number, number] {
  // Визуальная конвенция: rotation.y = −yaw (см. robotGroundPose) → угол −yaw вокруг Y.
  const half = -yaw / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

export function clampAbs(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

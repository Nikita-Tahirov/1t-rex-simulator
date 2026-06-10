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

// Составной коллайдер шасси: задняя коробка + передний КЛИН. Это ключ к
// vertical-spinner механике 1T-REX: цельный кубоид давал вертикальную стенку
// 0.32 м, на которую заехать физически невозможно, и корпуса блокировались
// раньше, чем диск (вылет 0.36 м < полудлины 0.54 м) мог коснуться соперника.
// Клин поддевает соперника → тот заезжает → попадает под диск ротора.
// Все координаты — в локале ТЕЛА (offset CHASSIS_COLLIDER_Y уже учтён).
export const CHASSIS_BOX_HALF = [0.32, 0.16, 0.46] as const;
export const CHASSIS_BOX_X = -0.22; // коробка покрывает x ∈ [-0.54, 0.10]
export const WEDGE_BACK_X = 0.1; // стык клина с коробкой
export const WEDGE_NOSE_X = CHASSIS_HALF[0]; // нос робота
export const WEDGE_TOP_Y = CHASSIS_COLLIDER_Y + CHASSIS_HALF[1]; // верх у стыка (0.12)
export const WEDGE_BOTTOM_Y = CHASSIS_COLLIDER_Y - CHASSIS_HALF[1]; // днище (−0.20)
/** Верх носовой кромки: тонкая (0.04 м) грань для устойчивости convex hull. */
export const WEDGE_NOSE_TOP_Y = WEDGE_BOTTOM_Y + 0.04;
/** Масса задней коробки; остаток CHASSIS_MASS — в клине (низкий передний ЦМ). */
export const CHASSIS_BOX_MASS = 70;
export const WEDGE_MASS = CHASSIS_MASS - CHASSIS_BOX_MASS;
/** Трение клина ниже трения коробки: нос соперника должен скользить вверх. */
export const WEDGE_FRICTION = 0.12;
export const CHASSIS_BOX_FRICTION = 0.3;

/**
 * Вершины переднего клина (8 точек, плоский массив xyz) для ConvexHullCollider.
 * Наклон рабочей грани ≈ 32.5° — нос соперника при трении 0.12 скользит вверх.
 */
export function wedgeVertices(): number[] {
  const z = CHASSIS_HALF[2];
  const corners: Array<[number, number]> = [
    [WEDGE_BACK_X, WEDGE_TOP_Y],
    [WEDGE_BACK_X, WEDGE_BOTTOM_Y],
    [WEDGE_NOSE_X, WEDGE_NOSE_TOP_Y],
    [WEDGE_NOSE_X, WEDGE_BOTTOM_Y],
  ];
  return corners.flatMap(([x, y]) => [x, y, z, x, y, -z]);
}
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

import { ROBOT } from '../constants.ts';

/**
 * Точки старта по четырём углам арены. Робот появляется на безопасном отступе от
 * стен и смотрит носом в центр поля.
 */

/** Отступ центра шасси от стены, м (запас на габарит + манёвр). */
const CORNER_INSET_M = 3.5;

/** Стартовая высота центра шасси над полом. */
export const SPAWN_HEIGHT = ROBOT.chassisStartHeight;

export interface SpawnPose {
  x: number;
  z: number;
  yaw: number;
}

/** Знаки координат углов: 0=СЗ, 1=СВ, 2=ЮЗ, 3=ЮВ (совпадает с colorIndex). */
const CORNER_SIGNS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

/** Спавн для угла `corner` (0..3) на арене размера `arenaSize`. Нос — к центру. */
export function cornerSpawn(corner: number, arenaSize: number): SpawnPose {
  const reach = arenaSize / 2 - CORNER_INSET_M;
  const [sx, sz] = CORNER_SIGNS[((corner % 4) + 4) % 4]!;
  const x = sx * reach;
  const z = sz * reach;
  // forward=(cos yaw, sin yaw) должен указывать на центр, т.е. в направлении (-x,-z).
  const yaw = Math.atan2(-z, -x);
  return { x, z, yaw };
}

import { PHYSICS, ROBOT } from '../constants.ts';
import {
  ROBOT_DAMAGE_FOOTPRINT_RADIUS,
  SHREDDER_DAMAGE_PER_SECOND,
  SHREDDER_DAMAGE_RADIUS,
  SHREDDER_FRICTION_COEFFICIENT,
  SHREDDER_JOULES_PER_DAMAGE,
  SHREDDER_ROTATION_SPEED,
} from './arenaData.ts';

export function computeShredderDamageDelta(
  dx: number,
  dz: number,
  robotY: number,
  dt: number,
): number {
  if (robotY >= 0.8) return 0;
  const distance = Math.hypot(dx, dz);
  const reach = SHREDDER_DAMAGE_RADIUS + ROBOT_DAMAGE_FOOTPRINT_RADIUS;
  if (distance > reach) return 0;
  const overlapRatio = Math.min(1, Math.max(0, (reach - distance) / ROBOT_DAMAGE_FOOTPRINT_RADIUS));
  const normalLoadN = ROBOT.chassisMass * Math.abs(PHYSICS.gravity) * overlapRatio;
  const slipDistanceM = SHREDDER_ROTATION_SPEED * SHREDDER_DAMAGE_RADIUS * dt;
  const frictionWorkJ = normalLoadN * SHREDDER_FRICTION_COEFFICIENT * slipDistanceM;
  return Math.max(frictionWorkJ / SHREDDER_JOULES_PER_DAMAGE, SHREDDER_DAMAGE_PER_SECOND * dt);
}

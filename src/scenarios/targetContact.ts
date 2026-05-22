import { ROBOT } from '@/physics/constants.ts';
import type { ScenarioContext } from './manager.ts';
import { pickTargetPosition } from './targetPosition.ts';

const TARGET_RADIUS_M = 0.25;
const TARGET_CONTACT_EPS_M = 0.02;

export const TARGET_CENTER_HIT_RADIUS_M =
  Math.min(ROBOT.chassisLength, ROBOT.chassisWidth) / 2 + TARGET_RADIUS_M - TARGET_CONTACT_EPS_M;

export function emitTargetHitIfInContact(ctx: ScenarioContext): void {
  if (ctx.elapsedSec <= 0.5 || ctx.bus.count('targetHit') > 0) return;
  const target = pickTargetPosition(ctx.seed);
  const distance = Math.hypot(
    ctx.telemetry.positionX - target.x,
    ctx.telemetry.positionZ - target.z,
  );
  if (distance <= TARGET_CENTER_HIT_RADIUS_M) {
    ctx.bus.emit('targetHit');
  }
}

export function isRobotTargetContact(role: unknown): boolean {
  return role === 'chassis' || role === 'spinner';
}

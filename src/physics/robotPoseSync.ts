import type { RapierRigidBody } from '@react-three/rapier';
import type { RefObject } from 'react';
import { WHEEL_DEFS } from './robotDefs.ts';
import { localPointToWorld, type RobotGroundPose, type Vec3Like } from './robotGroundPose.ts';

export function syncWheelBodiesToGroundPose(
  wheelRefs: readonly RefObject<RapierRigidBody>[],
  pose: RobotGroundPose,
  center: Vec3Like,
  scratch: Vec3Like,
): void {
  for (let i = 0; i < wheelRefs.length; i += 1) {
    const wheel = wheelRefs[i]?.current;
    const def = WHEEL_DEFS[i];
    if (!wheel || !def) continue;
    const targetWheelPos = localPointToWorld(pose, center, def.anchor, scratch);
    const wheelPos = wheel.translation();
    const dx = targetWheelPos.x - wheelPos.x;
    const dy = targetWheelPos.y - wheelPos.y;
    const dz = targetWheelPos.z - wheelPos.z;
    if (dx * dx + dy * dy + dz * dz > 0.000004) {
      wheel.setTranslation({ x: targetWheelPos.x, y: targetWheelPos.y, z: targetWheelPos.z }, true);
    }
  }
}

export function angularVelocityOnAxis(
  body: RapierRigidBody | null,
  axis: { x: number; y: number; z: number },
): number {
  if (!body) return 0;
  const w = body.angvel();
  return w.x * axis.x + w.y * axis.y + w.z * axis.z;
}

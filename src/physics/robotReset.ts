import type { RapierRigidBody } from '@react-three/rapier';
import type { RefObject } from 'react';
import type { RobotResetPose } from '@/store/scenario-store.ts';
import { WHEEL_DEFS } from './robotDefs.ts';
import { computeRobotGroundPose, localPointToWorld } from './robotGroundPose.ts';

export function resetChassis(chassis: RapierRigidBody, pose: RobotResetPose) {
  const groundPose = computeRobotGroundPose(pose.x, pose.z, pose.yaw);
  // chassis = kinematicPosition: позицию/rotation двигаем через setNextKinematic*.
  // Дополнительно дёргаем setTranslation/setRotation для мгновенной синхронизации
  // (next-методы применяются на следующем шаге, а нам нужно «здесь и сейчас»
  // для последующего расчёта позиции колёс).
  chassis.setTranslation({ x: pose.x, y: groundPose.chassisY, z: pose.z }, true);
  chassis.setRotation(groundPose.rotation, true);
  chassis.setNextKinematicTranslation({ x: pose.x, y: groundPose.chassisY, z: pose.z });
  chassis.setNextKinematicRotation(groundPose.rotation);
  return groundPose;
}

export function resetRobotPose(
  chassis: RapierRigidBody,
  wheelRefs: readonly RefObject<RapierRigidBody>[],
  pose: RobotResetPose,
): void {
  const groundPose = resetChassis(chassis, pose);
  const center = { x: pose.x, y: groundPose.chassisY, z: pose.z };
  const wheelWorld = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < WHEEL_DEFS.length; i += 1) {
    const wheel = wheelRefs[i]?.current;
    const def = WHEEL_DEFS[i];
    if (!wheel || !def) continue;
    const wheelPosition = localPointToWorld(groundPose, center, def.anchor, wheelWorld);
    wheel.setTranslation({ x: wheelPosition.x, y: wheelPosition.y, z: wheelPosition.z }, true);
    wheel.setLinvel({ x: 0, y: 0, z: 0 }, true);
    wheel.setAngvel({ x: 0, y: 0, z: 0 }, true);
    wheel.setRotation(groundPose.rotation, true);
  }
}

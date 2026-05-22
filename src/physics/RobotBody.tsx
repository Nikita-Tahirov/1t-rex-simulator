import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat';
import {
  CuboidCollider,
  type RapierCollider,
  type RapierRigidBody,
  RigidBody,
} from '@react-three/rapier';
import type { Ref } from 'react';
import { CHASSIS_COLLISION_GROUPS } from './collisionGroups.ts';
import { ROBOT } from './constants.ts';
import { RobotChassisVisuals } from './RobotChassisVisuals.tsx';
import type { useRobotDamageModel } from './useRobotDamageModel.ts';

const CHASSIS_ACTIVE_COLLISION_TYPES =
  ActiveCollisionTypes.DEFAULT |
  ActiveCollisionTypes.KINEMATIC_FIXED |
  ActiveCollisionTypes.KINEMATIC_KINEMATIC;

interface RobotBodyProps {
  chassisRef: Ref<RapierRigidBody>;
  chassisColliderRef: Ref<RapierCollider>;
  damageModel: ReturnType<typeof useRobotDamageModel>;
  showRealModel: boolean;
}

export function RobotBody({
  chassisRef,
  chassisColliderRef,
  damageModel,
  showRealModel,
}: RobotBodyProps) {
  return (
    <RigidBody
      ref={chassisRef}
      type="kinematicPosition"
      colliders={false}
      position={[0, ROBOT.chassisStartHeight, 0]}
      userData={{ role: 'chassis' }}
      onContactForce={damageModel.handleChassisContactForce}
      onCollisionEnter={damageModel.handleChassisCollisionEnter}
      activeCollisionTypes={CHASSIS_ACTIVE_COLLISION_TYPES}
    >
      <CuboidCollider
        ref={chassisColliderRef}
        args={[ROBOT.chassisLength / 2, ROBOT.chassisHeight / 2, ROBOT.chassisWidth / 2]}
        collisionGroups={CHASSIS_COLLISION_GROUPS}
      />
      <RobotChassisVisuals damage={damageModel.visualState} showRealModel={showRealModel} />
    </RigidBody>
  );
}

import { CylinderCollider, type RapierRigidBody, RigidBody } from '@react-three/rapier';
import { type RefObject, Suspense } from 'react';
import { WHEELS_COLLISION_GROUPS } from './collisionGroups.ts';
import { ROBOT } from './constants.ts';
import { RobotWheelModel } from './RobotWheelModel.tsx';
import { WHEEL_DEFS } from './robotDefs.ts';

interface RobotWheelsProps {
  wheelRefs: readonly RefObject<RapierRigidBody>[];
  showRealModel: boolean;
}

export function RobotWheels({ wheelRefs, showRealModel }: RobotWheelsProps) {
  return (
    <>
      {WHEEL_DEFS.map((w, i) => (
        <RigidBody
          key={w.name}
          ref={wheelRefs[i]!}
          colliders={false}
          position={[w.anchor[0], ROBOT.chassisStartHeight + w.anchor[1], w.anchor[2]]}
          mass={ROBOT.wheelMass}
          friction={1.4}
          restitution={0.02}
          linearDamping={0.15}
          angularDamping={0.15}
          userData={{ role: 'wheel' }}
          ccd
        >
          <CylinderCollider
            args={[ROBOT.wheelWidth / 2, ROBOT.wheelRadius]}
            rotation={[Math.PI / 2, 0, 0]}
            collisionGroups={WHEELS_COLLISION_GROUPS}
          />
          {showRealModel ? (
            <Suspense fallback={null}>
              <RobotWheelModel />
            </Suspense>
          ) : (
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry
                args={[ROBOT.wheelRadius, ROBOT.wheelRadius, ROBOT.wheelWidth, 24]}
              />
              <meshStandardMaterial color="#1a1a1f" metalness={0.1} roughness={0.85} />
            </mesh>
          )}
        </RigidBody>
      ))}
    </>
  );
}

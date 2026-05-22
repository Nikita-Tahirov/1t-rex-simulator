import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import { isRobotTargetContact } from './targetContact.ts';
import { pickTargetPosition } from './targetPosition.ts';

const TARGET_RADIUS = 0.25;
const TARGET_HEIGHT = 0.5;
const TARGET_MASS = 5;

interface SearchAndStrikeSpawnProps {
  busEmit: (name: string, delta?: number) => void;
  seed: number;
}

export function SearchAndStrikeSpawn({ busEmit, seed }: SearchAndStrikeSpawnProps) {
  const pos = useMemo(() => pickTargetPosition(seed), [seed]);
  return (
    <group>
      <RigidBody
        type="dynamic"
        mass={TARGET_MASS}
        friction={1.2}
        linearDamping={0.6}
        angularDamping={0.6}
        position={[pos.x, TARGET_HEIGHT / 2, pos.z]}
        colliders={false}
        onCollisionEnter={(p) => {
          if (isRobotTargetContact(p.other.rigidBodyObject?.userData.role)) busEmit('targetHit');
        }}
      >
        <CylinderCollider args={[TARGET_HEIGHT / 2, TARGET_RADIUS]} />
        <mesh castShadow>
          <cylinderGeometry args={[TARGET_RADIUS, TARGET_RADIUS, TARGET_HEIGHT, 24]} />
          <meshStandardMaterial
            color="#e23a5b"
            roughness={0.55}
            metalness={0.15}
            emissive="#3a0a14"
          />
        </mesh>
      </RigidBody>
    </group>
  );
}

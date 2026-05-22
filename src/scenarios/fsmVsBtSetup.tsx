import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import { SceneMarkerRing } from '@/physics/SceneMarkers.tsx';
import { isRobotTargetContact } from './targetContact.ts';
import { pickTargetPosition } from './targetPosition.ts';

const TARGET_RADIUS = 0.25;
const TARGET_HEIGHT = 0.5;
const TARGET_MASS = 5;
const OBSTACLE_HALF: [number, number, number] = [0.18, 0.3, 0.18];
const OBSTACLES: Array<{ id: string; x: number; z: number }> = [
  { id: 'n', x: 0, z: -1.6 },
  { id: 's', x: 0, z: 1.6 },
  { id: 'w', x: -1.6, z: 0 },
  { id: 'e', x: 1.6, z: 0 },
];

interface SpawnProps {
  busEmit: (name: string, delta?: number) => void;
  seed: number;
}

export function FsmVsBtSpawn({ busEmit, seed }: SpawnProps) {
  const targetPos = useMemo(() => pickTargetPosition(seed), [seed]);
  return (
    <group>
      <RigidBody
        type="dynamic"
        mass={TARGET_MASS}
        friction={1.2}
        linearDamping={0.6}
        angularDamping={0.6}
        position={[targetPos.x, TARGET_HEIGHT / 2, targetPos.z]}
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

      {OBSTACLES.map((obstacle) => (
        <RigidBody
          key={obstacle.id}
          type="fixed"
          position={[obstacle.x, OBSTACLE_HALF[1], obstacle.z]}
          colliders={false}
          userData={{ role: 'arena-static', objectId: `fsm-bt-obstacle-${obstacle.id}` }}
          onCollisionEnter={(p) => {
            if (p.other.rigidBodyObject?.userData.role === 'chassis') busEmit('obstacleCollision');
          }}
        >
          <CylinderCollider args={[OBSTACLE_HALF[1], OBSTACLE_HALF[0]]} />
          <mesh castShadow>
            <cylinderGeometry
              args={[OBSTACLE_HALF[0], OBSTACLE_HALF[0], OBSTACLE_HALF[1] * 2, 16]}
            />
            <meshStandardMaterial color="#d05a4a" roughness={0.7} />
          </mesh>
        </RigidBody>
      ))}

      <SceneMarkerRing
        position={[0, 0]}
        innerRadius={0.45}
        outerRadius={0.6}
        color="#3ad29f"
        opacity={0.7}
      />
    </group>
  );
}

import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  CylinderCollider,
  type RapierRigidBody,
  RigidBody,
} from '@react-three/rapier';
import { useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { applyRobotDamage } from '@/store/robotIntegrity.ts';
import { ARENA_COLORS } from '@/theme/tokens.ts';
import { StaticBlock } from './ArenaPrimitives.tsx';
import {
  SHREDDER_BLADE_HALF,
  SHREDDER_BLADE_SIZE,
  SHREDDER_CENTER,
  SHREDDER_CONTACT_DAMAGE,
  SHREDDER_JOULES_PER_DAMAGE,
  SHREDDER_ROTATION_SPEED,
  SHREDDER_TEETH,
  ZONE_A_PAD_HALF_X,
  ZONE_A_PAD_HALF_Z,
} from './arenaData.ts';
import { getShredderRotorAngle, setShredderRotorAngle } from './shredderState.ts';
import { ZONE_CENTERS } from './zoneLayout.ts';

const Y_AXIS = new Vector3(0, 1, 0);

export function ShredderZone() {
  const rotorRef = useRef<RapierRigidBody>(null);
  const rotorAngle = useRef(0);
  const rotorRotation = useRef(new Quaternion());

  useFrame((_state, delta) => {
    rotorAngle.current += delta * SHREDDER_ROTATION_SPEED;
    setShredderRotorAngle(rotorAngle.current);
    const angle = getShredderRotorAngle();
    rotorRef.current?.setNextKinematicRotation(
      rotorRotation.current.setFromAxisAngle(Y_AXIS, angle),
    );
  });

  return (
    <group>
      <StaticBlock
        color={ARENA_COLORS.shredder.floor}
        emissive={ARENA_COLORS.shredder.emissive}
        half={[ZONE_A_PAD_HALF_X, 0.035, ZONE_A_PAD_HALF_Z]}
        id="zone-a-service-pad"
        position={[SHREDDER_CENTER[0], 0.035, SHREDDER_CENTER[1]]}
      />
      <RigidBody
        ref={rotorRef}
        type="kinematicPosition"
        colliders={false}
        position={[SHREDDER_CENTER[0], 0.28, SHREDDER_CENTER[1]]}
        friction={0.85}
        restitution={0.05}
        userData={{ role: 'shredder-rotor' }}
        activeCollisionTypes={
          ActiveCollisionTypes.DEFAULT |
          ActiveCollisionTypes.KINEMATIC_FIXED |
          ActiveCollisionTypes.KINEMATIC_KINEMATIC
        }
        onCollisionEnter={({ other }) => {
          if (other.rigidBodyObject?.userData.role !== 'chassis') return;
          hitShredderRotor();
        }}
      >
        {([0, Math.PI / 2] as const).map((rotation) => (
          <group key={rotation} rotation={[0, rotation, 0]}>
            <CuboidCollider args={SHREDDER_BLADE_HALF} />
            <mesh castShadow>
              <boxGeometry args={SHREDDER_BLADE_SIZE} />
              <meshStandardMaterial
                color={ARENA_COLORS.shredder.primary}
                emissive={ARENA_COLORS.shredder.emissive}
                emissiveIntensity={0.35}
                metalness={0.72}
                roughness={0.24}
              />
            </mesh>
          </group>
        ))}
        <CylinderCollider args={[0.09, 0.28]} />
        <mesh castShadow>
          <cylinderGeometry args={[0.22, 0.28, 0.18, 24]} />
          <meshStandardMaterial
            color={ARENA_COLORS.shredder.darkMetal}
            metalness={0.8}
            roughness={0.28}
          />
        </mesh>
      </RigidBody>
      <group position={[SHREDDER_CENTER[0], 0.18, SHREDDER_CENTER[1]]}>
        {([Math.PI / 4, -Math.PI / 4] as const).map((rotation) => (
          <mesh key={rotation} castShadow rotation={[0, rotation, 0]}>
            <boxGeometry args={[1.75, 0.08, 0.22]} />
            <meshStandardMaterial
              color={ARENA_COLORS.shredder.darkMetal}
              emissive={ARENA_COLORS.shredder.emissive}
              emissiveIntensity={0.18}
              metalness={0.72}
              roughness={0.24}
            />
          </mesh>
        ))}
      </group>
      <StaticBlock
        color={ARENA_COLORS.shredder.stopper}
        half={[2.25, 0.16, 0.07]}
        id="zone-a-back-stop"
        position={[ZONE_CENTERS.A.x, 0.16, ZONE_CENTERS.A.z - 1.5]}
      />
      {SHREDDER_TEETH.map((tooth) => (
        <StaticBlock key={tooth.id} {...tooth} />
      ))}
    </group>
  );
}

function hitShredderRotor(): void {
  applyRobotDamage({
    amount: SHREDDER_CONTACT_DAMAGE,
    source: 'shredder',
    nowMs: performance.now(),
    energyJ: SHREDDER_CONTACT_DAMAGE * SHREDDER_JOULES_PER_DAMAGE,
  });
}

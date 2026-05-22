import { Text } from '@react-three/drei/core/Text.js';
import { ConvexHullCollider, CuboidCollider, RigidBody } from '@react-three/rapier';
import { Suspense, useMemo, useState } from 'react';
import { Color } from 'three';
import { ARENA_COLORS, SIM_COLORS } from '@/theme/tokens.ts';
import { RAMP_COLLISION_GROUPS } from '../collisionGroups.ts';
import { GROUND_LAYER_Y } from '../groundLayers.ts';
import { ARENA_TEXT_FONT_URL } from './arenaData.ts';
import { applyCrateHit, CRATE_MAX_HEALTH, crateHealthRatio } from './crateDamage.ts';
import { createRampGeometry, createRampVertices, rampDirectionRotation } from './rampGeometry.ts';
import type { DamageCrateDef, RampBlockDef, StaticBlockDef, Vec3 } from './types.ts';

export function ZoneMarker({
  color,
  label,
  position,
}: {
  color: string;
  label: 'A' | 'B' | 'C' | 'D';
  position: Vec3;
}) {
  return (
    <group position={position}>
      <mesh
        position={[0, GROUND_LAYER_Y.zoneMarker, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={3}
      >
        <ringGeometry args={[1.55, 1.6, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.38}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
        <planeGeometry args={[1.2, 1.2]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <planeGeometry args={[0.9, 0.7]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
        <ringGeometry args={[0.48, 0.5, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={7}>
        <planeGeometry args={[0.18, 0.18]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={label === 'A' ? 0.95 : 0.75}
          depthWrite={false}
        />
      </mesh>
      <Suspense fallback={null}>
        <Text
          anchorX="center"
          anchorY="middle"
          color={color}
          font={ARENA_TEXT_FONT_URL}
          fontSize={1.35}
          outlineColor={SIM_COLORS.deepBackground}
          outlineWidth={0.025}
          position={[0, 0.16, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {label}
        </Text>
      </Suspense>
    </group>
  );
}

export function StaticBlock({
  color,
  emissive = SIM_COLORS.wallEmissive,
  half,
  id,
  opacity = 1,
  position,
  rotation,
}: StaticBlockDef) {
  return (
    <RigidBody
      type="fixed"
      friction={0.9}
      colliders={false}
      position={position}
      rotation={rotation}
      userData={{ role: staticBlockRole(id), objectId: id }}
    >
      <CuboidCollider args={half} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[half[0] * 2, half[1] * 2, half[2] * 2]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.08}
          envMapIntensity={0.35}
          metalness={0.12}
          opacity={opacity}
          roughness={0.78}
          transparent={opacity < 1}
        />
      </mesh>
    </RigidBody>
  );
}

export function RampBlock({
  color,
  direction,
  emissive = SIM_COLORS.wallEmissive,
  friction = 1.05,
  opacity = 1,
  position,
  restitution = 0,
  size,
}: RampBlockDef) {
  const vertices = useMemo(() => createRampVertices(size), [size]);
  const geometry = useMemo(() => createRampGeometry(size), [size]);
  const rotation = rampDirectionRotation(direction);

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={position}
      rotation={rotation}
      userData={{ role: 'arena-ramp' }}
    >
      <ConvexHullCollider
        args={[vertices]}
        collisionGroups={RAMP_COLLISION_GROUPS}
        friction={friction}
        restitution={restitution}
      />
      <mesh castShadow receiveShadow geometry={geometry}>
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.08}
          envMapIntensity={0.35}
          flatShading
          metalness={0.1}
          opacity={opacity}
          roughness={0.82}
          transparent={opacity < 1}
        />
      </mesh>
    </RigidBody>
  );
}

function staticBlockRole(id: string): 'arena-floor' | 'arena-static' {
  if (/(floor|pad|landing|deck)/u.test(id)) return 'arena-floor';
  return 'arena-static';
}

export function DamageCrate({ color, id, position, size }: DamageCrateDef) {
  const [damageState, setDamageState] = useState({
    health: CRATE_MAX_HEALTH,
    lastDamageAtMs: -Infinity,
  });
  const health = damageState.health;
  const healthRatio = crateHealthRatio(health);
  const damageRatio = 1 - healthRatio;
  const materialColor = useMemo(
    () =>
      new Color(color)
        .lerp(new Color(ARENA_COLORS.crates.damaged), Math.min(1, damageRatio * 0.9))
        .lerp(new Color(ARENA_COLORS.crates.critical), Math.max(0, damageRatio - 0.72) * 0.45),
    [color, damageRatio],
  );
  if (health <= 0) return null;

  return (
    <RigidBody
      type="dynamic"
      colliders={false}
      position={position}
      mass={5}
      friction={0.82}
      restitution={0.05}
      linearDamping={0.35}
      angularDamping={0.45}
      userData={{ role: 'damage-crate', crateId: id }}
      onCollisionEnter={({ other }) => {
        const role = other.rigidBodyObject?.userData.role;
        const nowMs = performance.now();
        setDamageState((state) => applyCrateHit(state, role, nowMs));
      }}
      ccd
    >
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={materialColor}
          emissive={ARENA_COLORS.crates.emissive}
          emissiveIntensity={0.18 + damageRatio * 0.22}
          metalness={0.12}
          roughness={0.74 + damageRatio * 0.12}
        />
      </mesh>
      <mesh position={[0, size[1] / 2 + 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size[0] * 0.82, size[2] * 0.18]} />
        <meshBasicMaterial
          color={ARENA_COLORS.crates.label}
          transparent
          opacity={0.18 + healthRatio * 0.22}
        />
      </mesh>
    </RigidBody>
  );
}

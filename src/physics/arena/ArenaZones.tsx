import { Text } from '@react-three/drei/core/Text.js';
import { Suspense } from 'react';
import { ARENA_COLORS, SIM_COLORS } from '@/theme/tokens.ts';
import { DamageCrate, RampBlock, StaticBlock, ZoneMarker } from './ArenaPrimitives.tsx';
import {
  ARENA_TEXT_FONT_URL,
  BRIDGE_CENTER_X,
  BRIDGE_CENTER_Z,
  BRIDGE_DECK_CENTER_Y,
  BRIDGE_DECK_HALF_X,
  BRIDGE_DECK_HALF_Y,
  BRIDGE_DECK_HALF_Z,
  BRIDGE_LANDING_HALF_X,
  BRIDGE_LANDING_HALF_Z,
  BRIDGE_RAILS,
  BRIDGE_RAMPS,
  CRATES,
  GARAGE_POSTS,
  SECTOR_ENTRY_RAMPS,
  ZONE_B_PAD_HALF_X,
  ZONE_B_PAD_HALF_Z,
  ZONE_C_PAD_HALF_X,
  ZONE_C_PAD_HALF_Z,
} from './arenaData.ts';
import { ShredderZone } from './ShredderZone.tsx';
import { ZONE_CENTERS } from './zoneLayout.ts';

export function TrainingComplex() {
  return (
    <group>
      <ZoneMarker
        label="A"
        color={ARENA_COLORS.shredder.primary}
        position={[ZONE_CENTERS.A.x, 0.01, ZONE_CENTERS.A.z]}
      />
      <ZoneMarker
        label="B"
        color={ARENA_COLORS.crates.primary}
        position={[ZONE_CENTERS.B.x, 0.01, ZONE_CENTERS.B.z]}
      />
      <ZoneMarker
        label="C"
        color={ARENA_COLORS.garage.primary}
        position={[ZONE_CENTERS.C.x, 0.01, ZONE_CENTERS.C.z]}
      />
      <ShredderZone />
      <CrateDamageZone />
      <CoveredGarageZone />
      <BridgeZone />
      {SECTOR_ENTRY_RAMPS.map((ramp) => (
        <RampBlock key={ramp.id} {...ramp} />
      ))}
    </group>
  );
}

function CrateDamageZone() {
  return (
    <group>
      <StaticBlock
        color={ARENA_COLORS.crates.floor}
        emissive={ARENA_COLORS.crates.emissive}
        half={[ZONE_B_PAD_HALF_X, 0.035, ZONE_B_PAD_HALF_Z]}
        id="zone-b-impact-pad"
        position={[ZONE_CENTERS.B.x, 0.035, ZONE_CENTERS.B.z]}
      />
      {CRATES.map((crate) => (
        <DamageCrate key={crate.id} {...crate} />
      ))}
      <StaticBlock
        color={ARENA_COLORS.crates.bumper}
        emissive={ARENA_COLORS.crates.emissive}
        half={[2.25, 0.18, 0.08]}
        id="zone-b-rear-bumper"
        position={[ZONE_CENTERS.B.x, 0.18, ZONE_CENTERS.B.z - 1.6]}
      />
    </group>
  );
}

function CoveredGarageZone() {
  return (
    <group>
      <StaticBlock
        color={ARENA_COLORS.garage.floor}
        emissive={ARENA_COLORS.garage.emissive}
        half={[ZONE_C_PAD_HALF_X, 0.035, ZONE_C_PAD_HALF_Z]}
        id="zone-c-garage-floor"
        position={[ZONE_CENTERS.C.x, 0.035, ZONE_CENTERS.C.z]}
      />
      <StaticBlock
        color={ARENA_COLORS.garage.wall}
        emissive={ARENA_COLORS.garage.emissive}
        half={[0.08, 0.44, 1.6]}
        id="zone-c-back-wall"
        position={[ZONE_CENTERS.C.x - 1.5, 0.44, ZONE_CENTERS.C.z]}
      />
      <StaticBlock
        color={ARENA_COLORS.garage.wall}
        emissive={ARENA_COLORS.garage.emissive}
        half={[ZONE_C_PAD_HALF_X, 0.44, 0.08]}
        id="zone-c-north-wall"
        position={[ZONE_CENTERS.C.x, 0.44, ZONE_CENTERS.C.z - 1.65]}
      />
      <StaticBlock
        color={ARENA_COLORS.garage.wall}
        emissive={ARENA_COLORS.garage.emissive}
        half={[ZONE_C_PAD_HALF_X, 0.44, 0.08]}
        id="zone-c-south-wall"
        position={[ZONE_CENTERS.C.x, 0.44, ZONE_CENTERS.C.z + 1.65]}
      />
      {GARAGE_POSTS.map((post) => (
        <StaticBlock key={post.id} {...post} />
      ))}
      <StaticBlock
        color={ARENA_COLORS.garage.roof}
        emissive={ARENA_COLORS.garage.emissive}
        half={[1.65, 0.08, 1.78]}
        id="zone-c-roof"
        opacity={0.78}
        position={[ZONE_CENTERS.C.x, 0.95, ZONE_CENTERS.C.z]}
      />
    </group>
  );
}

function BridgeZone() {
  return (
    <group>
      <StaticBlock
        color={ARENA_COLORS.bridge.floor}
        emissive={ARENA_COLORS.bridge.emissive}
        half={[BRIDGE_LANDING_HALF_X, 0.035, BRIDGE_LANDING_HALF_Z]}
        id="zone-d-landing-pad"
        position={[BRIDGE_CENTER_X, 0.035, BRIDGE_CENTER_Z]}
      />
      <StaticBlock
        color={ARENA_COLORS.bridge.deck}
        emissive={ARENA_COLORS.bridge.emissive}
        half={[BRIDGE_DECK_HALF_X, BRIDGE_DECK_HALF_Y, BRIDGE_DECK_HALF_Z]}
        id="zone-d-bridge-deck"
        position={[BRIDGE_CENTER_X, BRIDGE_DECK_CENTER_Y, BRIDGE_CENTER_Z]}
      />
      <BridgeDeckMarker />
      {BRIDGE_RAMPS.map((ramp) => (
        <RampBlock key={ramp.id} {...ramp} />
      ))}
      {BRIDGE_RAILS.map((rail) => (
        <StaticBlock key={rail.id} {...rail} />
      ))}
    </group>
  );
}

function BridgeDeckMarker() {
  // Подложка серая (как мост), но буква в hazard-warn — стальной серый на
  // стальном сером плохо читается; warn даёт сильный контраст и держит
  // Industrial-палитру.
  return (
    <group position={[BRIDGE_CENTER_X, 0.62, BRIDGE_CENTER_Z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={8}>
        <planeGeometry args={[0.78, 0.5]} />
        <meshBasicMaterial color={ARENA_COLORS.bridge.primary} transparent opacity={0.32} />
      </mesh>
      <Suspense fallback={null}>
        <Text
          anchorX="center"
          anchorY="middle"
          color={SIM_COLORS.warn}
          font={ARENA_TEXT_FONT_URL}
          fontSize={0.62}
          outlineColor={SIM_COLORS.deepBackground}
          outlineWidth={0.02}
          position={[0, 0.025, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          D
        </Text>
      </Suspense>
    </group>
  );
}

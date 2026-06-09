import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { SIM_COLORS } from '@/theme/tokens.ts';
import { TrainingComplex } from './arena/ArenaZones.tsx';
import { ARENA_AXES, createWallDefsForSize, FLOOR_PANELS } from './arena/arenaData.ts';
import { HazardPerimeter, SectorStencil } from './arena/IndustrialDecals.tsx';
import { useArenaSize } from './arenaSize.ts';
import { ARENA } from './constants.ts';
import { GROUND_LAYER_Y } from './groundLayers.ts';

const FLOOR_PANEL_Y = GROUND_LAYER_Y.floorPanel;
const ARENA_AXIS_Y = GROUND_LAYER_Y.arenaAxis;

/**
 * Арена. По умолчанию (одиночка/тренировки) — 18 м с полным тренировочным
 * комплексом и разметкой зон. В сетевом бою рендерится внутри `ArenaSizeProvider`
 * (размер берётся из `useArenaSize`) с `trainingComplex={false}` — большое чистое
 * поле без зон/декалей, только пол, стены и hazard-периметр.
 */
export function Arena({ trainingComplex = true }: { trainingComplex?: boolean }) {
  const arenaSize = useArenaSize();
  const half = arenaSize / 2;

  return (
    <group>
      <RigidBody type="fixed" friction={0.95}>
        <CuboidCollider args={[half, 0.05, half]} position={[0, -0.05, 0]} />
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[arenaSize, arenaSize, 32, 32]} />
          <meshStandardMaterial
            color={SIM_COLORS.floorBase}
            emissive={SIM_COLORS.floorEmissive}
            emissiveIntensity={0.05}
            envMapIntensity={0.35}
            metalness={0.05}
            roughness={0.92}
          />
        </mesh>
        {trainingComplex &&
          FLOOR_PANELS.map((panel) => (
            <mesh
              key={panel.id}
              receiveShadow
              rotation={[-Math.PI / 2, 0, 0]}
              position={[panel.position[0], FLOOR_PANEL_Y, panel.position[2]]}
              renderOrder={1}
            >
              <planeGeometry args={panel.size} />
              <meshBasicMaterial
                color={panel.color}
                transparent
                opacity={panel.opacity}
                polygonOffset
                polygonOffsetFactor={-1}
                polygonOffsetUnits={-1}
                depthWrite={false}
              />
            </mesh>
          ))}
        {trainingComplex && <ArenaRings />}
        {trainingComplex &&
          ARENA_AXES.map((axis) => (
            <mesh
              key={axis.id}
              rotation={[-Math.PI / 2, 0, axis.rotation]}
              position={[0, ARENA_AXIS_Y, 0]}
              renderOrder={2}
            >
              <planeGeometry args={[arenaSize, 0.06]} />
              <meshBasicMaterial
                color={axis.color}
                transparent
                opacity={0.55}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
                depthWrite={false}
              />
            </mesh>
          ))}
        <HazardPerimeter half={half} />
        {trainingComplex && <SectorStencil />}
      </RigidBody>

      {createWallDefsForSize(arenaSize).map((wall) => (
        <ArenaWall key={wall.id} half={wall.half} position={wall.position} />
      ))}

      {trainingComplex && <TrainingComplex />}
    </group>
  );
}

function ArenaRings() {
  // Радиус 1.25 (а ¬1.0): кольцо ¬должно перекрываться конусами Восьмёрки,
  // которые стоят ровно в (±1.0, 0). Раньше конус целиком блокировал часть
  // дуги кольца, что воспринималось как «дыра в текстуре».
  return (
    <mesh
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, GROUND_LAYER_Y.arenaRing, 0]}
      renderOrder={1}
    >
      <ringGeometry args={[1.25, 1.3, 64]} />
      <meshBasicMaterial
        color={SIM_COLORS.warn}
        transparent
        opacity={0.4}
        polygonOffset
        polygonOffsetFactor={-3}
        polygonOffsetUnits={-3}
        depthWrite={false}
      />
    </mesh>
  );
}

function ArenaWall({
  half,
  position,
}: {
  half: [number, number, number];
  position: [number, number, number];
}) {
  return (
    <RigidBody type="fixed" friction={0.7} userData={{ role: 'arena-wall' }}>
      <CuboidCollider args={half} position={position} />
      <mesh castShadow receiveShadow position={position}>
        <boxGeometry args={[half[0] * 2, half[1] * 2, half[2] * 2]} />
        <meshStandardMaterial
          color={SIM_COLORS.wallBase}
          emissive={SIM_COLORS.wallEmissive}
          emissiveIntensity={0.08}
          envMapIntensity={0.45}
          metalness={0.05}
          roughness={0.85}
        />
      </mesh>
      <mesh position={[position[0], ARENA.wallHeight + 0.018, position[2]]}>
        <boxGeometry args={[Math.max(half[0] * 2, 0.08), 0.035, Math.max(half[2] * 2, 0.08)]} />
        <meshBasicMaterial color={SIM_COLORS.warn} transparent opacity={0.55} />
      </mesh>
    </RigidBody>
  );
}

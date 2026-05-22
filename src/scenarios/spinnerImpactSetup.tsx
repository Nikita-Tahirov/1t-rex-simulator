import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useRef } from 'react';
import { SceneMarkerRing } from '@/physics/SceneMarkers.tsx';
import { telemetry } from '@/store/telemetry.ts';
import {
  IMPACT_RADIUS_M,
  IMPACT_RPM,
  IMPACT_SPEED_MPS,
  READY_RPM,
  START_X,
  START_Z,
  spinnerEnergyJ,
  TARGET_HALF,
  TARGET_X,
  TARGET_Z,
  WEAPON_REACH_M,
} from './spinnerImpactConfig.ts';

interface SpinnerImpactSpawnProps {
  emit: (name: string, delta?: number) => void;
  setMetric: (name: string, value: number) => void;
}

const SPEED_WINDOW_FRAMES = 4;

export function SpinnerImpactSpawn({ emit, setMetric }: SpinnerImpactSpawnProps) {
  const hitRef = useRef(false);
  const peakRpmRef = useRef(0);
  const lastWeaponRef = useRef<{ x: number; z: number } | null>(null);
  const recentSpeedsRef = useRef<number[]>([]);

  useFrame(() => {
    const rpm = Math.abs(telemetry.spinnerRpm);
    const yaw = telemetry.yaw;
    const weaponX = telemetry.positionX + Math.cos(yaw) * WEAPON_REACH_M;
    const weaponZ = telemetry.positionZ + Math.sin(yaw) * WEAPON_REACH_M;
    const prevWeapon = lastWeaponRef.current ?? { x: weaponX, z: weaponZ };
    const targetDist = distancePointToSegment(
      TARGET_X,
      TARGET_Z,
      prevWeapon.x,
      prevWeapon.z,
      weaponX,
      weaponZ,
    );
    peakRpmRef.current = Math.max(peakRpmRef.current, rpm);

    const speeds = recentSpeedsRef.current;
    speeds.push(telemetry.speed);
    if (speeds.length > SPEED_WINDOW_FRAMES) speeds.shift();
    const peakSpeed = speeds.length === 0 ? telemetry.speed : Math.max(...speeds);

    setMetric('spinner_peak_rpm', peakRpmRef.current);
    setMetric('target_dist_m', targetDist);
    setMetric('spinner_energy_j', spinnerEnergyJ(rpm));
    if (rpm >= READY_RPM) setMetric('weapon_ready', 1);
    if (isImpact(hitRef.current, targetDist, rpm, peakSpeed)) {
      hitRef.current = true;
      emit('armorHit');
      setMetric('impact_rpm', rpm);
      setMetric('impact_speed_mps', peakSpeed);
      setMetric('impact_energy_j', spinnerEnergyJ(rpm));
    }
    lastWeaponRef.current = { x: weaponX, z: weaponZ };
  });

  return (
    <group>
      <RigidBody type="fixed" position={[TARGET_X, TARGET_HALF[1], TARGET_Z]} colliders={false}>
        <CuboidCollider args={TARGET_HALF} />
        <mesh castShadow receiveShadow>
          <boxGeometry args={[TARGET_HALF[0] * 2, TARGET_HALF[1] * 2, TARGET_HALF[2] * 2]} />
          <meshStandardMaterial color="#d05a4a" roughness={0.55} metalness={0.45} />
        </mesh>
      </RigidBody>
      <SceneMarkerRing
        position={[TARGET_X, TARGET_Z]}
        innerRadius={0.4}
        outerRadius={0.55}
        color="#ff3ea5"
        opacity={0.6}
      />
      <SceneMarkerRing
        position={[START_X, START_Z]}
        innerRadius={0.35}
        outerRadius={0.5}
        color="#6f4cff"
        opacity={0.55}
      />
    </group>
  );
}

function isImpact(
  alreadyHit: boolean,
  targetDist: number,
  rpm: number,
  peakSpeed: number,
): boolean {
  return (
    !alreadyHit &&
    targetDist <= IMPACT_RADIUS_M &&
    rpm >= IMPACT_RPM &&
    peakSpeed >= IMPACT_SPEED_MPS
  );
}

function distancePointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq <= 1e-9) return Math.hypot(px - bx, pz - bz);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

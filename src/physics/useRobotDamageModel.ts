import { useFrame } from '@react-three/fiber';
import type { CollisionEnterPayload, ContactForcePayload } from '@react-three/rapier';
import { useRef, useState } from 'react';
import { applyRobotDamage } from '@/store/robotIntegrity.ts';
import { telemetry } from '@/store/telemetry.ts';
import {
  computeImpactDamageDelta,
  isDamagingArenaRole,
  ROBOT_IMPACT_DAMAGE_COOLDOWN_MS,
  type RobotDamageSource,
  robotHealthRatio,
} from './robotDamage.ts';

export interface RobotDamageVisualState {
  health: number;
  lastDamageAtMs: number;
  lastSource: RobotDamageSource;
  /** Окно «свежего удара» (650 мс) — вычисляем здесь, чтобы render-функция
   * `RobotDamageEffects` оставалась чистой и проходила `react-hooks/purity`. */
  recentHit: boolean;
}

const RECENT_HIT_WINDOW_MS = 650;

function readDamageVisualState(): RobotDamageVisualState {
  const lastDamageAtMs = telemetry.robotDamageLastAtMs;
  return {
    health: telemetry.robotHealth,
    lastDamageAtMs,
    lastSource: telemetry.robotDamageLastSource,
    recentHit: performance.now() - lastDamageAtMs < RECENT_HIT_WINDOW_MS,
  };
}

export function useRobotDamageModel() {
  const lastImpactAtMs = useRef(-Infinity);
  const lastVisualSampleAtMs = useRef(0);
  const [visualState, setVisualState] = useState(readDamageVisualState);

  useFrame(() => {
    const nowMs = performance.now();
    if (nowMs - lastVisualSampleAtMs.current < 90) return;
    lastVisualSampleAtMs.current = nowMs;
    setVisualState(readDamageVisualState());
  });

  const applyImpact = (role: unknown, speedMps: number, contactForceN?: number) => {
    if (!isDamagingArenaRole(role)) return;
    const nowMs = performance.now();
    if (nowMs - lastImpactAtMs.current < ROBOT_IMPACT_DAMAGE_COOLDOWN_MS) return;
    const result = computeImpactDamageDelta(
      contactForceN === undefined ? { speedMps } : { speedMps, contactForceN },
    );
    if (result.damage <= 0) return;
    lastImpactAtMs.current = nowMs;
    applyRobotDamage({
      amount: result.damage,
      source: role === 'shredder-rotor' ? 'shredder' : 'impact',
      nowMs,
      energyJ: Math.max(result.kineticEnergyJ, result.impulseEnergyJ),
      ...(contactForceN === undefined ? {} : { forceN: contactForceN }),
    });
  };

  const handleChassisContactForce = (payload: ContactForcePayload) => {
    applyImpact(
      payload.other.rigidBodyObject?.userData.role,
      telemetry.speed,
      payload.maxForceMagnitude,
    );
  };

  // Для kinematicPosition chassis contact force всегда 0 (физика не толкает
  // kinematic body), поэтому компенсируем onCollisionEnter — модель урона
  // считает kinetic energy из telemetry.speed, что для нашего случая
  // эквивалентно «робот врезался на скорости».
  const handleChassisCollisionEnter = (payload: CollisionEnterPayload) => {
    applyImpact(payload.other.rigidBodyObject?.userData.role, telemetry.speed);
  };

  return {
    visualState,
    driveScale: driveScaleForHealth(visualState.health),
    handleChassisContactForce,
    handleChassisCollisionEnter,
    handleKinematicObstacleImpact: applyImpact,
  };
}

function driveScaleForHealth(health: number): number {
  const ratio = robotHealthRatio(health);
  if (ratio <= 0) return 0;
  if (ratio < 0.25) return 0.45;
  if (ratio < 0.5) return 0.72;
  return 1;
}

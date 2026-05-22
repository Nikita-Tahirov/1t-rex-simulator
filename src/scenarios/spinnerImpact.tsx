import { useSimStore } from '@/store/sim-store.ts';
import { telemetry } from '@/store/telemetry.ts';
import { goToTarget, pilotIdle } from './_pilotHelpers.ts';
import type { Scenario } from './manager.ts';
import {
  READY_RPM,
  SPINUP_TIMEOUT_SEC,
  START_X,
  START_Z,
  TARGET_RPM,
  TARGET_X,
  TARGET_Z,
} from './spinnerImpactConfig.ts';
import { SpinnerImpactSpawn } from './spinnerImpactSetup.tsx';

/**
 * Сценарий «Удар ротором».
 *
 * Профильная боевая проверка 1T-REX: робот должен раскрутить вертикальный
 * ротор, автономно подойти к бронепанели и нанести удар оружием. Цель
 * засчитывается только если одновременно выполнены условия по геометрии,
 * скорости робота и оборотам ротора.
 */

export const spinnerImpact: Scenario = {
  id: 'spinnerImpact',
  title: 'Удар ротором',
  category: 'mission',
  description:
    'Профильная боевая миссия: раскрутить вертикальный ротор, подойти к бронепанели и нанести удар при достаточных оборотах и скорости.',
  initialPose: { x: START_X, z: START_Z, yaw: 0 },
  timeoutSec: 20,
  isAutonomyAllowed: true,

  setup: (ctx) => (
    <SpinnerImpactSpawn
      emit={(n, d) => ctx.bus.emit(n, d)}
      setMetric={(n, v) => ctx.bus.set(n, v)}
    />
  ),

  reset: () => {
    useSimStore.getState().setSpinnerTargetRpm(TARGET_RPM);
  },

  pilot: (ctx) => {
    useSimStore.getState().setSpinnerTargetRpm(TARGET_RPM);
    if (ctx.bus.count('armorHit') > 0) {
      pilotIdle(ctx);
      return;
    }
    const rpmReady =
      (ctx.elapsedSec >= 1.0 && Math.abs(telemetry.spinnerRpm) >= READY_RPM) ||
      ctx.elapsedSec >= SPINUP_TIMEOUT_SEC;
    if (!rpmReady) {
      pilotIdle(ctx);
      return;
    }
    goToTarget(ctx, {
      targetX: TARGET_X,
      targetZ: TARGET_Z,
      arriveRadius: 0.1,
      cruiseThrottle: 0.34,
      turnGain: 1.35,
      yawErrThrottleCut: 0.75,
      minMoveThrottle: 0.14,
    });
  },

  metric: (ctx) => ctx.elapsedSec,

  goal: (ctx) => ctx.bus.count('armorHit') > 0,

  targetForFsm: () => ({ x: TARGET_X, z: TARGET_Z }),

  summary: (ctx) => ({
    armor_hit: ctx.bus.count('armorHit') > 0 ? 1 : 0,
    impact_rpm: ctx.bus.get('impact_rpm', 0),
    impact_speed_mps: ctx.bus.get('impact_speed_mps', 0),
    impact_energy_j: ctx.bus.get('impact_energy_j', 0),
    spinner_peak_rpm: ctx.bus.get('spinner_peak_rpm', 0),
    target_dist_m: ctx.bus.get('target_dist_m', 999999),
    elapsed_sec: ctx.elapsedSec,
  }),
};

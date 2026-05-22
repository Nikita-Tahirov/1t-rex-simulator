import { describe, expect, it } from 'vitest';
import type { ScenarioLogEntry } from '@/store/scenario-store.ts';
import { verifyScenarioLog } from './verification.ts';

function entry(
  t: number,
  x: number,
  z: number,
  overrides: Partial<ScenarioLogEntry> = {},
): ScenarioLogEntry {
  return {
    t,
    x,
    z,
    yaw: 0,
    speed: 1,
    yawRate: 0,
    spinnerRpm: 0,
    batterySoc: 1,
    batteryVoltageLoad: 50,
    batteryCurrent: 0,
    batteryTemperature: 22,
    wheelCurrent: [0, 0, 0, 0],
    wheelTemperature: [22, 22, 22, 22],
    filteredRoll: 0,
    filteredPitch: 0,
    filteredYaw: 0,
    rangeMeters: Number.POSITIVE_INFINITY,
    arenaDamage: 0,
    fsmState: 'IDLE',
    metricValue: t,
    pilotActive: true,
    pilotThrottle: 0.7,
    pilotTurn: 0,
    pilotBrake: 1,
    ...overrides,
  };
}

function lineEntries(fromX: number, toX: number, count: number): ScenarioLogEntry[] {
  const out: ScenarioLogEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = i / (count - 1);
    out.push(entry(i * 0.1, fromX + (toX - fromX) * u, 0));
  }
  return out;
}

const SLALOM_POINTS = [
  { x: -3, z: 0 },
  { x: -2.35, z: 0.9 },
  { x: -1.65, z: 1.45 },
  { x: -0.9, z: 0 },
  { x: -0.15, z: -1.45 },
  { x: 0.5, z: 0 },
  { x: 1.15, z: 1.45 },
  { x: 1.7, z: 0 },
  { x: 2.25, z: -1.45 },
  { x: 3, z: 0 },
];

function slalomEntries(count: number): ScenarioLogEntry[] {
  const segmentLengths = SLALOM_POINTS.slice(1).map((point, i) => {
    const prev = SLALOM_POINTS[i]!;
    return Math.hypot(point.x - prev.x, point.z - prev.z);
  });
  const total = segmentLengths.reduce((sum, value) => sum + value, 0);
  const out: ScenarioLogEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    let distance = (i / (count - 1)) * total;
    let segmentIndex = 0;
    while (segmentIndex < segmentLengths.length - 1 && distance > segmentLengths[segmentIndex]!) {
      distance -= segmentLengths[segmentIndex]!;
      segmentIndex += 1;
    }
    const a = SLALOM_POINTS[segmentIndex]!;
    const b = SLALOM_POINTS[segmentIndex + 1]!;
    const segmentLength = segmentLengths[segmentIndex]!;
    const u = segmentLength === 0 ? 0 : distance / segmentLength;
    out.push(
      entry(i * 0.1, a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u, {
        yawRate: 0.45,
        pilotTurn: 0.4,
      }),
    );
  }

  return out;
}

describe('scenario behavior verification', () => {
  it('rejects a fake obstacle run where status is completed but robot barely moved', () => {
    const entries = lineEntries(-3, -2.9, 10);
    const result = verifyScenarioLog({
      scenarioId: 'obstacleAvoidance',
      seed: 1,
      status: 'completed',
      elapsedSec: 1,
      metricValue: 1,
      entries,
      summary: {},
    });

    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => check.id === 'obstacle.finish' && !check.passed)).toBe(
      true,
    );
  });

  it('rejects an obstacle run that reaches the finish by driving straight', () => {
    const entries = lineEntries(-3, 3, 70);
    const result = verifyScenarioLog({
      scenarioId: 'obstacleAvoidance',
      seed: 1,
      status: 'completed',
      elapsedSec: 7,
      metricValue: 7,
      entries,
      summary: {},
    });

    expect(result.passed).toBe(false);
    expect(
      result.checks.some((check) => check.id === 'obstacle.lateralCoverage' && !check.passed),
    ).toBe(true);
  });

  it('accepts an obstacle run that reaches the finish through a slalom', () => {
    const entries = slalomEntries(120);
    const result = verifyScenarioLog({
      scenarioId: 'obstacleAvoidance',
      seed: 1,
      status: 'completed',
      elapsedSec: 12,
      metricValue: 12,
      entries,
      summary: {},
    });

    expect(result.passed).toBe(true);
    expect(result.observed.pathLengthM).toBeGreaterThan(7);
  });

  it('rejects an obstacle run that slaloms on the wrong side of the centerline barriers', () => {
    const entries = slalomEntries(120).map((item) => ({ ...item, z: -item.z }));
    const result = verifyScenarioLog({
      scenarioId: 'obstacleAvoidance',
      seed: 1,
      status: 'completed',
      elapsedSec: 12,
      metricValue: 12,
      entries,
      summary: {},
    });

    expect(result.passed).toBe(false);
    expect(
      result.checks.some((check) => check.id === 'obstacle.centerlinePasses' && !check.passed),
    ).toBe(true);
  });

  it('rejects an obstacle run with centerline passes in reversed order', () => {
    const entries = [
      entry(0, -3, 0),
      entry(0.1, 2.25, -1.45, { yawRate: 0.5, pilotTurn: 0.5 }),
      entry(0.2, 1.15, 1.45, { yawRate: 0.5, pilotTurn: 0.5 }),
      entry(0.3, -0.15, -1.45, { yawRate: 0.5, pilotTurn: 0.5 }),
      entry(0.4, -1.65, 1.45, { yawRate: 0.5, pilotTurn: 0.5 }),
      entry(0.5, -0.9, 0, { yawRate: 0.5, pilotTurn: 0.5 }),
      entry(0.6, 0.5, 0, { yawRate: 0.5, pilotTurn: 0.5 }),
      entry(0.7, 1.7, 0, { yawRate: 0.5, pilotTurn: 0.5 }),
      entry(0.8, 3, 0),
    ];
    const result = verifyScenarioLog({
      scenarioId: 'obstacleAvoidance',
      seed: 1,
      status: 'completed',
      elapsedSec: 0.8,
      metricValue: 0.8,
      entries,
      summary: {},
    });

    expect(
      result.checks.some((check) => check.id === 'obstacle.centerlineOrder' && !check.passed),
    ).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('rejects a sparse waypoint-only obstacle log', () => {
    const entries = SLALOM_POINTS.map((point, i) =>
      entry(i * 1.2, point.x, point.z, { yawRate: 0.5, pilotTurn: 0.5 }),
    );
    const result = verifyScenarioLog({
      scenarioId: 'obstacleAvoidance',
      seed: 1,
      status: 'completed',
      elapsedSec: 1.2 * (entries.length - 1),
      metricValue: 8,
      entries,
      summary: {},
    });

    expect(result.checks.some((check) => check.id === 'obstacle.logDensity' && !check.passed)).toBe(
      true,
    );
    expect(result.passed).toBe(false);
  });

  it('requires spin-up and armor hit evidence for spinnerImpact', () => {
    const entries = lineEntries(-2.2, 2.25, 70).map((item, i, arr) => ({
      ...item,
      spinnerRpm: 3400,
      events: {
        spinner_peak_rpm: 3400,
        weapon_ready: 1,
        target_dist_m: Math.max(0, 4.6 * (1 - i / (arr.length - 1))),
        armorHit: i === arr.length - 1 ? 1 : 0,
        impact_rpm: i === arr.length - 1 ? 3400 : 0,
        impact_speed_mps: i === arr.length - 1 ? 1.2 : 0,
        impact_energy_j: i === arr.length - 1 ? 16_000 : 0,
      },
    }));
    const result = verifyScenarioLog({
      scenarioId: 'spinnerImpact',
      seed: 1,
      status: 'completed',
      elapsedSec: 7,
      metricValue: 7,
      entries,
      summary: {},
    });

    expect(result.passed).toBe(true);
  });

  it('accepts spinnerImpact when the weapon hits but chassis center stays outside target center', () => {
    const entries = lineEntries(-2.2, 1.39, 70).map((item, i, arr) => ({
      ...item,
      spinnerRpm: 3400,
      events: {
        armorHit: i === arr.length - 1 ? 1 : 0,
        impact_rpm: i === arr.length - 1 ? 3400 : 0,
        impact_speed_mps: i === arr.length - 1 ? 1.2 : 0,
        impact_energy_j: i === arr.length - 1 ? 16_000 : 0,
      },
    }));
    const result = verifyScenarioLog({
      scenarioId: 'spinnerImpact',
      seed: 1,
      status: 'completed',
      elapsedSec: 7,
      metricValue: 7,
      entries,
      summary: { spinner_peak_rpm: 3400 },
    });

    expect(result.passed).toBe(true);
  });

  it('fails madgwick experiment when yaw program is not informative', () => {
    const entries = lineEntries(0, 2, 20);
    const result = verifyScenarioLog({
      scenarioId: 'madgwickVsComplementary',
      seed: 1,
      status: 'completed',
      elapsedSec: 2,
      metricValue: 0,
      entries,
      summary: {
        samples: 20,
        yaw_range_deg: 10,
        rmse_yaw_madgwick_deg: 1,
        rmse_yaw_complementary_deg: 2,
        ratio_comp_over_madgwick: 2,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => check.id === 'madgwick.yawRange' && !check.passed)).toBe(
      true,
    );
  });
});

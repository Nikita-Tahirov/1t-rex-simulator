import { describe, expect, it } from 'vitest';
import type { ScenarioLogEntry } from '@/store/scenario-store.ts';
import performanceBudget from '../../budgets/performance.json' with { type: 'json' };
import { verifyScenarioLog } from './verification.ts';

const ENTRY_COUNT = 50_000;
const MAX_MS = performanceBudget.runtime.maxVerificationMsFor50kEntries;

describe('scenario verification peak load', () => {
  it(`verifies ${ENTRY_COUNT} entries in linear time budget`, () => {
    const entries = makeObstacleEntries(ENTRY_COUNT);
    const started = performance.now();
    const result = verifyScenarioLog({
      scenarioId: 'obstacleAvoidance',
      seed: 20260428,
      status: 'completed',
      elapsedSec: 30,
      metricValue: 0,
      entries,
      summary: {},
    });
    const duration = performance.now() - started;
    expect(result.passed).toBe(true);
    expect(duration).toBeLessThan(MAX_MS);
  });
});

function makeObstacleEntries(count: number): ScenarioLogEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    const t = ratio * 30;
    const point = pointOnSlalom(ratio);
    return {
      t,
      x: point.x,
      z: point.z,
      yaw: 0,
      speed: 1,
      yawRate: 0.45,
      spinnerRpm: 0,
      batterySoc: 1,
      batteryVoltageLoad: 44.4,
      batteryCurrent: 0,
      batteryTemperature: 22,
      wheelCurrent: [0, 0, 0, 0],
      wheelTemperature: [22, 22, 22, 22],
      filteredRoll: 0,
      filteredPitch: 0,
      filteredYaw: 0,
      rangeMeters: 1,
      arenaDamage: 0,
      fsmState: 'IDLE',
      metricValue: ratio,
      pilotActive: true,
      pilotThrottle: 0.8,
      pilotTurn: 0.4,
      pilotBrake: 1,
    };
  });
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
  { x: 2.85, z: -1.1 },
  { x: 3, z: 0 },
];

const SEGMENT_LENGTHS = SLALOM_POINTS.slice(1).map((point, index) => {
  const prev = SLALOM_POINTS[index]!;
  return Math.hypot(point.x - prev.x, point.z - prev.z);
});
const TOTAL_LENGTH = SEGMENT_LENGTHS.reduce((sum, value) => sum + value, 0);

function pointOnSlalom(ratio: number): { x: number; z: number } {
  let distance = ratio * TOTAL_LENGTH;
  let segmentIndex = 0;
  while (segmentIndex < SEGMENT_LENGTHS.length - 1 && distance > SEGMENT_LENGTHS[segmentIndex]!) {
    distance -= SEGMENT_LENGTHS[segmentIndex]!;
    segmentIndex += 1;
  }
  const a = SLALOM_POINTS[segmentIndex]!;
  const b = SLALOM_POINTS[segmentIndex + 1]!;
  const segmentLength = SEGMENT_LENGTHS[segmentIndex]!;
  const u = segmentLength === 0 ? 0 : distance / segmentLength;
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
}

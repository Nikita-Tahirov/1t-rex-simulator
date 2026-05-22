import { add, dist, fmt, lastEvent, minDistanceTo, num } from './scenario-log-core.mjs';

const CENTERLINE_OBSTACLE_PASSES = [
  { id: 'A', x: -1.65, z: 0, side: 1 },
  { id: 'B', x: -0.15, z: 0, side: -1 },
  { id: 'C', x: 1.15, z: 0, side: 1 },
  { id: 'D', x: 2.25, z: 0, side: -1 },
];
const PASS_X_TOLERANCE_M = 0.35;
const PASS_SIDE_MIN_Z_M = 0.55;
const INTERPOLATED_PASS_SIDE_MIN_Z_M = 0.75;
const PASS_MAX_CENTER_DISTANCE_M = 1.55;
const MAX_LOG_SEGMENT_DT_SEC = 0.25;
const MAX_PHYSICAL_SEGMENT_SPEED_MPS = 8;
const SWITCH_CROSSINGS = [
  { id: 'AB', x: -0.9 },
  { id: 'BC', x: 0.5 },
  { id: 'CD', x: 1.7 },
];
const SWITCH_X_TOLERANCE_M = 0.4;

export function verifyObstacleAvoidance(payload, stats, checks) {
  const collisions = lastEvent(payload.entries, 'collisions');
  add(checks, 'status.completed', payload.status === 'completed', payload.status, 'completed');
  add(
    checks,
    'obstacle.progress',
    stats.endX - stats.startX >= 5.2,
    fmt(stats.endX - stats.startX),
    '>= 5.2 м',
  );
  add(
    checks,
    'obstacle.finish',
    dist(stats.endX, stats.endZ, 3, 0) <= 0.7,
    fmt(dist(stats.endX, stats.endZ, 3, 0)),
    '<= 0.7 м',
  );
  add(checks, 'obstacle.path', stats.pathLengthM >= 7.0, fmt(stats.pathLengthM), '>= 7.0 м');
  add(
    checks,
    'obstacle.lateralCoverage',
    stats.zMin <= -0.5 && stats.zMax >= 0.5,
    { zMin: fmt(stats.zMin), zMax: fmt(stats.zMax) },
    'zMin <= -0.50 && zMax >= 0.50',
  );
  add(
    checks,
    'obstacle.slalomCrossings',
    stats.zAxisCrossings >= 3 && stats.lateralTravelM >= 3.0,
    { crossings: stats.zAxisCrossings, lateralTravelM: fmt(stats.lateralTravelM) },
    'crossings >= 3 && lateralTravel >= 3.0 м',
  );
  const passEvidence = CENTERLINE_OBSTACLE_PASSES.map((obstacle) =>
    evaluateObstaclePass(payload, obstacle),
  );
  const interpolatedPassEvidence = CENTERLINE_OBSTACLE_PASSES.map((obstacle) =>
    evaluateInterpolatedObstaclePass(payload, obstacle),
  );
  add(
    checks,
    'obstacle.centerlinePasses',
    passEvidence.every((item) => item.passed),
    passEvidence.map((item) => ({
      id: item.id,
      side: item.side,
      zAbs: fmt(item.zAbs),
      xError: fmt(item.xError),
      minDist: fmt(item.minDist),
    })),
    `A:+Z, B:-Z, C:+Z, D:-Z; |dx| <= ${fmt(PASS_X_TOLERANCE_M)} м; |z| >= ${fmt(PASS_SIDE_MIN_Z_M)} м`,
  );
  add(
    checks,
    'obstacle.centerlineOrder',
    interpolatedPassEvidence.every((item) => item.passed) &&
      interpolatedPassEvidence.every(
        (item, index, array) => index === 0 || item.t > array[index - 1].t,
      ),
    interpolatedPassEvidence.map((item) => ({
      id: item.id,
      t: fmt(item.t),
      zAtX: fmt(item.zAtX),
    })),
    `A→B→C→D; side*zAtX >= ${fmt(INTERPOLATED_PASS_SIDE_MIN_Z_M)} м`,
  );
  const switchEvidence = evaluateSwitchCrossings(payload);
  add(
    checks,
    'obstacle.switchCrossings',
    switchEvidence.every((item) => item.passed),
    switchEvidence.map((item) => ({ id: item.id, xAtZ0: fmt(item.xAtZ0) })),
    `z=0 crossings near x=-0.9,0.5,1.7; |dx| <= ${fmt(SWITCH_X_TOLERANCE_M)} м`,
  );
  add(
    checks,
    'obstacle.logDensity',
    stats.maxSegmentDtSec <= MAX_LOG_SEGMENT_DT_SEC &&
      stats.maxSegmentSpeedMps <= MAX_PHYSICAL_SEGMENT_SPEED_MPS,
    {
      maxSegmentDtSec: fmt(stats.maxSegmentDtSec),
      maxSegmentSpeedMps: fmt(stats.maxSegmentSpeedMps),
    },
    `maxΔt <= ${fmt(MAX_LOG_SEGMENT_DT_SEC)} с && segmentSpeed <= ${fmt(MAX_PHYSICAL_SEGMENT_SPEED_MPS)} м/с`,
  );
  add(
    checks,
    'obstacle.steering',
    stats.maxAbsTurn >= 0.25 && stats.maxAbsYawRate >= 0.25,
    { turn: fmt(stats.maxAbsTurn), yawRate: fmt(stats.maxAbsYawRate) },
    'max|turn| >= 0.25 && max|yawRate| >= 0.25',
  );
  add(checks, 'obstacle.collisions', collisions === 0, collisions, '= 0');
}

function evaluateObstaclePass(payload, obstacle) {
  let nearest = payload.entries[0];
  let xError = Number.POSITIVE_INFINITY;
  for (const entry of payload.entries) {
    const candidate = Math.abs(entry.x - obstacle.x);
    if (candidate < xError) {
      nearest = entry;
      xError = candidate;
    }
  }
  const z = nearest?.z ?? 0;
  const zAbs = Math.abs(z);
  const minDist = minDistanceTo(payload.entries, obstacle.x, obstacle.z);
  const expectedSideReached = obstacle.side > 0 ? z >= PASS_SIDE_MIN_Z_M : z <= -PASS_SIDE_MIN_Z_M;
  return {
    id: obstacle.id,
    side: z >= 0 ? '+Z' : '-Z',
    zAbs,
    xError,
    minDist,
    passed:
      xError <= PASS_X_TOLERANCE_M && expectedSideReached && minDist <= PASS_MAX_CENTER_DISTANCE_M,
  };
}

function evaluateInterpolatedObstaclePass(payload, obstacle) {
  let best = null;
  for (let i = 1; i < payload.entries.length; i += 1) {
    const prev = payload.entries[i - 1];
    const current = payload.entries[i];
    const minX = Math.min(prev.x, current.x);
    const maxX = Math.max(prev.x, current.x);
    if (obstacle.x < minX || obstacle.x > maxX || prev.x === current.x) continue;
    const u = (obstacle.x - prev.x) / (current.x - prev.x);
    if (u < 0 || u > 1) continue;
    const zAtX = prev.z + (current.z - prev.z) * u;
    const t = num(prev.t) + (num(current.t) - num(prev.t)) * u;
    const passed =
      obstacle.side > 0
        ? zAtX >= INTERPOLATED_PASS_SIDE_MIN_Z_M
        : zAtX <= -INTERPOLATED_PASS_SIDE_MIN_Z_M;
    const candidate = { ...obstacle, t, zAtX, passed };
    if (!best || Math.abs(candidate.zAtX - obstacle.z) < Math.abs(best.zAtX - obstacle.z)) {
      best = candidate;
    }
  }
  return best ?? { ...obstacle, t: Number.POSITIVE_INFINITY, zAtX: 0, passed: false };
}

function evaluateSwitchCrossings(payload) {
  const crossings = [];
  for (let i = 1; i < payload.entries.length; i += 1) {
    const prev = payload.entries[i - 1];
    const current = payload.entries[i];
    if (prev.z === current.z) continue;
    if (!((prev.z <= 0 && current.z >= 0) || (prev.z >= 0 && current.z <= 0))) continue;
    const u = (0 - prev.z) / (current.z - prev.z);
    if (u < 0 || u > 1) continue;
    crossings.push({
      t: num(prev.t) + (num(current.t) - num(prev.t)) * u,
      xAtZ0: prev.x + (current.x - prev.x) * u,
    });
  }
  return SWITCH_CROSSINGS.map((expected) => {
    let best = null;
    for (const crossing of crossings) {
      if (best && Math.abs(best.xAtZ0 - expected.x) <= Math.abs(crossing.xAtZ0 - expected.x)) {
        continue;
      }
      best = crossing;
    }
    const xAtZ0 = best?.xAtZ0 ?? Number.POSITIVE_INFINITY;
    return {
      id: expected.id,
      xAtZ0,
      passed: Math.abs(xAtZ0 - expected.x) <= SWITCH_X_TOLERANCE_M,
    };
  });
}

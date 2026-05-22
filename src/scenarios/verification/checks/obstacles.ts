import { dist, fmt, lastEvent, minDistanceTo } from '../math.ts';
import type { CheckDraft, ScenarioVerificationPayload, TraceStats } from '../types.ts';
import { pushCheck } from './common.ts';

type ObstaclePass = { id: string; x: number; z: number; side: -1 | 1 };
type InterpolatedObstaclePass = ObstaclePass & {
  t: number;
  zAtX: number;
  xError: number;
  minDist: number;
  passed: boolean;
};

const CENTERLINE_OBSTACLE_PASSES: ObstaclePass[] = [
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

export function verifyObstacleAvoidance(
  payload: ScenarioVerificationPayload,
  stats: TraceStats,
  checks: CheckDraft[],
): void {
  const finishDist = dist(stats.endX, stats.endZ, 3, 0);
  const collisions = lastEvent(payload.entries, 'collisions');
  pushCheck(
    checks,
    'status.completed',
    'миссия завершилась целью',
    payload.status === 'completed',
    'status=completed',
    payload.status,
  );
  pushCheck(
    checks,
    'obstacle.start',
    'старт соответствует регламенту',
    dist(stats.startX, stats.startZ, -3, 0) <= 0.8,
    'start≈(-3,0)',
    `(${fmt(stats.startX)}, ${fmt(stats.startZ)})`,
  );
  pushCheck(
    checks,
    'obstacle.progress',
    'робот прошёл коридор к +X',
    stats.endX - stats.startX >= 5.2,
    'Δx ≥ 5.2 м',
    `${fmt(stats.endX - stats.startX)} м`,
  );
  pushCheck(
    checks,
    'obstacle.finish',
    'финиш достигнут физически',
    finishDist <= 0.7,
    'dist(end,finish) ≤ 0.7 м',
    `${fmt(finishDist)} м`,
  );
  pushCheck(
    checks,
    'obstacle.path',
    'траектория длиннее прямой линии старта-финиша',
    stats.pathLengthM >= 7.0,
    'path ≥ 7.0 м',
    `${fmt(stats.pathLengthM)} м`,
  );
  pushCheck(
    checks,
    'obstacle.lateralCoverage',
    'робот прошёл обе стороны слаломного коридора',
    stats.zMin <= -0.5 && stats.zMax >= 0.5,
    'zMin ≤ -0.50 ∧ zMax ≥ 0.50',
    `z=[${fmt(stats.zMin)}, ${fmt(stats.zMax)}]`,
  );
  pushCheck(
    checks,
    'obstacle.slalomCrossings',
    'траектория несколько раз пересекала центральную ось',
    stats.zAxisCrossings >= 3 && stats.lateralTravelM >= 3.0,
    'crossings ≥ 3 ∧ lateralTravel ≥ 3.0 м',
    `${stats.zAxisCrossings} / ${fmt(stats.lateralTravelM)} м`,
  );

  const passEvidence = CENTERLINE_OBSTACLE_PASSES.map((obstacle) =>
    evaluateObstaclePass(payload, obstacle),
  );
  const interpolatedPassEvidence = CENTERLINE_OBSTACLE_PASSES.map((obstacle) =>
    evaluateInterpolatedObstaclePass(payload, obstacle),
  );
  pushCheck(
    checks,
    'obstacle.centerlinePasses',
    'каждый центральный барьер объехан с заданной стороны',
    passEvidence.every((item) => item.passed),
    `A:+Z, B:-Z, C:+Z, D:-Z; |dx| ≤ ${fmt(PASS_X_TOLERANCE_M)} м; |z| ≥ ${fmt(PASS_SIDE_MIN_Z_M)} м`,
    passEvidence
      .map(
        (item) =>
          `${item.id}:${item.side}${fmt(item.zAbs)}м dx=${fmt(item.xError)}м d=${fmt(item.minDist)}м`,
      )
      .join(', '),
  );
  pushCheck(
    checks,
    'obstacle.centerlineOrder',
    'барьеры пройдены в порядке A→B→C→D по интерполированной траектории',
    interpolatedPassEvidence.every((item) => item.passed) &&
      interpolatedPassEvidence.every(
        (item, index, array) => index === 0 || item.t > array[index - 1]!.t,
      ),
    `A→B→C→D; side*zAtX ≥ ${fmt(INTERPOLATED_PASS_SIDE_MIN_Z_M)} м`,
    interpolatedPassEvidence
      .map((item) => `${item.id}:t=${fmt(item.t)} z=${fmt(item.zAtX)} d=${fmt(item.minDist)}м`)
      .join(', '),
  );
  const switchEvidence = evaluateSwitchCrossings(payload);
  pushCheck(
    checks,
    'obstacle.switchCrossings',
    'перестроения между барьерами выполнены в ожидаемых зонах',
    switchEvidence.every((item) => item.passed),
    `z=0 crossings near x=-0.9,0.5,1.7; |dx| ≤ ${fmt(SWITCH_X_TOLERANCE_M)} м`,
    switchEvidence.map((item) => `${item.id}:x=${fmt(item.xAtZ0)}`).join(', '),
  );
  pushCheck(
    checks,
    'obstacle.logDensity',
    'лог достаточно плотный, чтобы не скрыть проход сквозь препятствие',
    stats.maxSegmentDtSec <= MAX_LOG_SEGMENT_DT_SEC &&
      stats.maxSegmentSpeedMps <= MAX_PHYSICAL_SEGMENT_SPEED_MPS,
    `maxΔt ≤ ${fmt(MAX_LOG_SEGMENT_DT_SEC)} с ∧ segmentSpeed ≤ ${fmt(MAX_PHYSICAL_SEGMENT_SPEED_MPS)} м/с`,
    `maxΔt=${fmt(stats.maxSegmentDtSec)} с, segmentSpeed=${fmt(stats.maxSegmentSpeedMps)} м/с`,
  );
  pushCheck(
    checks,
    'obstacle.steering',
    'автопилот реально выдавал команды поворота',
    stats.maxAbsTurn >= 0.25 && stats.maxAbsYawRate >= 0.25,
    'max|turn| ≥ 0.25 ∧ max|yawRate| ≥ 0.25',
    `turn=${fmt(stats.maxAbsTurn)}, yawRate=${fmt(stats.maxAbsYawRate)}`,
  );
  pushCheck(
    checks,
    'obstacle.collisions',
    'слалом пройден без контактов с барьерами',
    collisions === 0,
    'collisions = 0',
    `${collisions}`,
  );
}

function evaluateInterpolatedObstaclePass(
  payload: ScenarioVerificationPayload,
  obstacle: ObstaclePass,
): InterpolatedObstaclePass {
  let best: InterpolatedObstaclePass | null = null;
  for (let i = 1; i < payload.entries.length; i += 1) {
    const prev = payload.entries[i - 1]!;
    const current = payload.entries[i]!;
    const minX = Math.min(prev.x, current.x);
    const maxX = Math.max(prev.x, current.x);
    if (obstacle.x < minX || obstacle.x > maxX || prev.x === current.x) continue;
    const u = (obstacle.x - prev.x) / (current.x - prev.x);
    if (u < 0 || u > 1) continue;
    const zAtX = prev.z + (current.z - prev.z) * u;
    const t = prev.t + (current.t - prev.t) * u;
    const passed =
      obstacle.side > 0
        ? zAtX >= INTERPOLATED_PASS_SIDE_MIN_Z_M
        : zAtX <= -INTERPOLATED_PASS_SIDE_MIN_Z_M;
    const candidate = { ...obstacle, t, zAtX, xError: 0, minDist: Math.abs(zAtX), passed };
    if (!best || Math.abs(candidate.zAtX) < Math.abs(best.zAtX)) best = candidate;
  }
  return (
    best ?? {
      ...obstacle,
      t: Number.POSITIVE_INFINITY,
      zAtX: 0,
      xError: Number.POSITIVE_INFINITY,
      minDist: Number.POSITIVE_INFINITY,
      passed: false,
    }
  );
}

function evaluateSwitchCrossings(
  payload: ScenarioVerificationPayload,
): Array<{ id: string; xAtZ0: number; passed: boolean }> {
  const crossings: Array<{ t: number; xAtZ0: number }> = [];
  for (let i = 1; i < payload.entries.length; i += 1) {
    const prev = payload.entries[i - 1]!;
    const current = payload.entries[i]!;
    if (prev.z === current.z) continue;
    if (!((prev.z <= 0 && current.z >= 0) || (prev.z >= 0 && current.z <= 0))) continue;
    const u = (0 - prev.z) / (current.z - prev.z);
    if (u < 0 || u > 1) continue;
    crossings.push({
      t: prev.t + (current.t - prev.t) * u,
      xAtZ0: prev.x + (current.x - prev.x) * u,
    });
  }
  return SWITCH_CROSSINGS.map((expected) => {
    let best: { t: number; xAtZ0: number } | null = null;
    for (const crossing of crossings) {
      if (best && Math.abs(best.xAtZ0 - expected.x) <= Math.abs(crossing.xAtZ0 - expected.x))
        continue;
      best = crossing;
    }
    const xAtZ0 = best?.xAtZ0 ?? Number.POSITIVE_INFINITY;
    return { id: expected.id, xAtZ0, passed: Math.abs(xAtZ0 - expected.x) <= SWITCH_X_TOLERANCE_M };
  });
}

function evaluateObstaclePass(
  payload: ScenarioVerificationPayload,
  obstacle: ObstaclePass,
): { id: string; side: string; zAbs: number; xError: number; minDist: number; passed: boolean } {
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

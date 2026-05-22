import { dist, fmt, lastEvent, minDistanceTo, pickTargetPosition } from '../math.ts';
import type { CheckDraft, ScenarioVerificationPayload, TraceStats } from '../types.ts';
import { pushCheck } from './common.ts';

export function verifyFigureEight(
  payload: ScenarioVerificationPayload,
  stats: TraceStats,
  checks: CheckDraft[],
): void {
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
    'figure.duration',
    'пройдена почти полная восьмёрка',
    payload.elapsedSec >= 25,
    'elapsed ≥ 25 с',
    `${fmt(payload.elapsedSec)} с`,
  );
  pushCheck(
    checks,
    'figure.path',
    'робот прошёл заметную траекторию',
    stats.pathLengthM >= 7,
    'path ≥ 7 м',
    `${fmt(stats.pathLengthM)} м`,
  );
  pushCheck(
    checks,
    'figure.xCoverage',
    'траектория покрыла обе петли по X',
    stats.xMin <= -1.2 && stats.xMax >= 1.2,
    'xMin ≤ -1.2 ∧ xMax ≥ 1.2',
    `x=[${fmt(stats.xMin)}, ${fmt(stats.xMax)}]`,
  );
  pushCheck(
    checks,
    'figure.zCoverage',
    'траектория пересекала верх/низ восьмёрки',
    stats.zMin <= -0.45 && stats.zMax >= 0.45,
    'zMin ≤ -0.45 ∧ zMax ≥ 0.45',
    `z=[${fmt(stats.zMin)}, ${fmt(stats.zMax)}]`,
  );
  const finishDist = dist(stats.endX, stats.endZ, 0, 0);
  pushCheck(
    checks,
    'figure.return',
    'финиш рядом со стартом',
    finishDist <= 1.05,
    'dist(end,start) ≤ 1.05 м',
    `${fmt(finishDist)} м`,
  );
  // Конусы в (±1.0, 0) — физические препятствия. Контакт фиксируется
  // через ScenarioEventBus и должен быть нулевым.
  const figureCollisions = lastEvent(payload.entries, 'collisions');
  pushCheck(
    checks,
    'figure.collisions',
    'восьмёрка пройдена без контактов с конусами',
    figureCollisions === 0,
    'collisions = 0',
    `${figureCollisions}`,
  );
}

export function verifySearchLike(
  payload: ScenarioVerificationPayload,
  stats: TraceStats,
  checks: CheckDraft[],
  prefix: 'search' | 'fsmBt',
): void {
  const target = pickTargetPosition(payload.seed);
  const startDist = dist(stats.startX, stats.startZ, target.x, target.z);
  const minTargetDist = minDistanceTo(payload.entries, target.x, target.z);
  const hit = lastEvent(payload.entries, 'targetHit');
  pushCheck(
    checks,
    'status.completed',
    'контакт завершил сценарий',
    payload.status === 'completed',
    'status=completed',
    payload.status,
  );
  pushCheck(
    checks,
    `${prefix}.targetHit`,
    'зафиксирован физический контакт с целью',
    hit > 0,
    'targetHit > 0',
    `${hit}`,
  );
  pushCheck(
    checks,
    `${prefix}.approach`,
    'робот сокращал дистанцию до цели',
    startDist - minTargetDist >= 2,
    'distStart − distMin ≥ 2 м',
    `${fmt(startDist - minTargetDist)} м`,
  );
  pushCheck(
    checks,
    `${prefix}.nearTarget`,
    'траектория дошла до окрестности цели',
    minTargetDist <= 1.0,
    'minDist(target) ≤ 1.0 м',
    `${fmt(minTargetDist)} м`,
  );
  pushCheck(
    checks,
    `${prefix}.path`,
    'робот реально ехал к цели',
    stats.pathLengthM >= Math.max(1.5, startDist - 1.2),
    `path ≥ ${fmt(Math.max(1.5, startDist - 1.2))} м`,
    `${fmt(stats.pathLengthM)} м`,
  );
}

export function verifyFsmVsBt(
  payload: ScenarioVerificationPayload,
  stats: TraceStats,
  checks: CheckDraft[],
): void {
  verifySearchLike(payload, stats, checks, 'fsmBt');
  const mode = payload.summary?.mode ?? 0;
  pushCheck(
    checks,
    'fsmBt.mode',
    'зафиксирован автономный режим FSM или BT',
    mode === 1 || mode === 2,
    'mode ∈ {1,2}',
    `${mode}`,
  );
  pushCheck(
    checks,
    'fsmBt.tToHit',
    'сводка содержит время контакта',
    (payload.summary?.t_to_hit_sec ?? -1) > 0,
    't_to_hit_sec > 0',
    `${fmt(payload.summary?.t_to_hit_sec ?? -1)} с`,
  );
}

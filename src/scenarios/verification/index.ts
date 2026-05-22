import {
  commonChecks,
  pushCheck,
  verifyBrownout,
  verifyFigureEight,
  verifyFsmVsBt,
  verifyMadgwick,
  verifyObstacleAvoidance,
  verifySearchLike,
  verifySpinnerImpact,
} from './checks.ts';
import { fmt, summarizeTrace } from './math.ts';
import type { ScenarioVerificationPayload, ScenarioVerificationResult } from './types.ts';

export type { ScenarioVerificationPayload };

export function verifyScenarioLog(
  payload: ScenarioVerificationPayload,
): ScenarioVerificationResult {
  const entries = payload.entries.filter(
    (entry) => Number.isFinite(entry.x) && Number.isFinite(entry.z),
  );
  const normalizedPayload = { ...payload, entries };
  const stats = summarizeTrace(entries);
  const checks = commonChecks(normalizedPayload, stats);

  switch (payload.scenarioId) {
    case 'figureEight':
      verifyFigureEight(normalizedPayload, stats, checks);
      break;
    case 'obstacleAvoidance':
      verifyObstacleAvoidance(normalizedPayload, stats, checks);
      break;
    case 'searchAndStrike':
      verifySearchLike(normalizedPayload, stats, checks, 'search');
      break;
    case 'spinnerImpact':
      verifySpinnerImpact(normalizedPayload, stats, checks);
      break;
    case 'madgwickVsComplementary':
      verifyMadgwick(normalizedPayload, checks);
      break;
    case 'fsmVsBt':
      verifyFsmVsBt(normalizedPayload, stats, checks);
      break;
    case 'brownoutDischarge':
      verifyBrownout(normalizedPayload, stats, checks);
      break;
    default:
      pushCheck(
        checks,
        'scenario.known',
        'сценарий известен верификатору',
        false,
        'known id',
        payload.scenarioId,
      );
  }

  const passedChecks = checks.filter((check) => check.passed).length;
  const score = checks.length === 0 ? 0 : passedChecks / checks.length;
  const resultChecks = checks.map((check) => ({ ...check }));
  return {
    scenarioId: payload.scenarioId,
    passed: resultChecks.every((check) => check.passed),
    score,
    checks: resultChecks,
    observed: {
      sampleCount: stats.sampleCount,
      pathLengthM: Number(fmt(stats.pathLengthM)),
      maxSpeedMps: Number(fmt(stats.maxSpeedMps)),
      maxAbsYawRate: Number(fmt(stats.maxAbsYawRate)),
      pilotActiveRatio: Number(fmt(stats.pilotActiveRatio)),
      commandResponseRatio: Number(fmt(stats.commandResponseRatio)),
      startX: Number(fmt(stats.startX)),
      startZ: Number(fmt(stats.startZ)),
      endX: Number(fmt(stats.endX)),
      endZ: Number(fmt(stats.endZ)),
      maxSegmentDtSec: Number(fmt(stats.maxSegmentDtSec)),
      maxSegmentSpeedMps: Number(fmt(stats.maxSegmentSpeedMps)),
    },
  };
}

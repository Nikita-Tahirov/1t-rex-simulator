import { fmt } from '../math.ts';
import type { CheckDraft, ScenarioVerificationPayload, TraceStats } from '../types.ts';

export function pushCheck(
  checks: CheckDraft[],
  id: string,
  label: string,
  passed: boolean,
  expected: string,
  actual: string,
): void {
  checks.push({ id, label, passed, expected, actual });
}

export function commonChecks(
  payload: ScenarioVerificationPayload,
  stats: TraceStats,
): CheckDraft[] {
  const commandResponseMin = payload.scenarioId === 'brownoutDischarge' ? 0.15 : 0.5;
  return [
    {
      id: 'log.samples',
      label: 'лог содержит временной ряд',
      passed: stats.sampleCount >= 3,
      expected: '≥ 3 записей',
      actual: `${stats.sampleCount}`,
    },
    {
      id: 'pilot.active',
      label: 'автопилот реально управлял роботом',
      passed: stats.pilotActiveRatio >= 0.35,
      expected: 'pilotActive ≥ 35% записей',
      actual: `${fmt(stats.pilotActiveRatio * 100, 1)}%`,
    },
    {
      id: 'command.response',
      label: 'команды дают физический отклик',
      passed: stats.commandResponseRatio >= commandResponseMin,
      expected: `отклик ≥ ${fmt(commandResponseMin * 100, 0)}% командных записей`,
      actual: `${fmt(stats.commandResponseRatio * 100, 1)}%`,
    },
    {
      id: 'time.elapsed',
      label: 'симуляционное время согласовано с логом',
      passed:
        stats.sampleCount === 0 ||
        Math.abs((payload.entries.at(-1)?.t ?? payload.elapsedSec) - payload.elapsedSec) <= 0.25,
      expected: '|lastLog.t − elapsedSec| ≤ 0.25 с',
      actual: `${fmt(Math.abs((payload.entries.at(-1)?.t ?? 0) - payload.elapsedSec))} с`,
    },
  ];
}

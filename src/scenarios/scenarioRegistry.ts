import { brownoutDischarge } from './brownoutDischarge.tsx';
import { figureEight } from './figureEight.tsx';
import { fsmVsBt } from './fsmVsBt.tsx';
import { madgwickVsComplementary } from './madgwickVsComplementary.tsx';
import { obstacleAvoidance } from './obstacleAvoidance.tsx';
import type { Scenario, ScenarioCategory } from './scenario-types.ts';
import { searchAndStrike } from './searchAndStrike.tsx';
import { spinnerImpact } from './spinnerImpact.tsx';

export const SCENARIOS: Record<string, Scenario> = {
  [figureEight.id]: figureEight,
  [obstacleAvoidance.id]: obstacleAvoidance,
  [searchAndStrike.id]: searchAndStrike,
  [spinnerImpact.id]: spinnerImpact,
  [madgwickVsComplementary.id]: madgwickVsComplementary,
  [fsmVsBt.id]: fsmVsBt,
  [brownoutDischarge.id]: brownoutDischarge,
};

export const SCENARIO_LIST: Scenario[] = [
  figureEight,
  obstacleAvoidance,
  searchAndStrike,
  spinnerImpact,
  madgwickVsComplementary,
  fsmVsBt,
  brownoutDischarge,
];

export const SCENARIO_GROUPS: { id: ScenarioCategory; label: string; items: Scenario[] }[] = [
  {
    id: 'mission',
    label: 'Базовые миссии',
    items: [figureEight, obstacleAvoidance, searchAndStrike, spinnerImpact],
  },
  {
    id: 'experiment',
    label: 'Сравнительные эксперименты',
    items: [madgwickVsComplementary, fsmVsBt, brownoutDischarge],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS[id];
}

import type { ReactNode } from 'react';
import type { PilotInput, RobotResetPose } from '@/store/scenario-store.ts';
import type { telemetry } from '@/store/telemetry.ts';
import type { ScenarioEventBus } from './ScenarioEventBus.ts';

export interface ScenarioContext {
  elapsedSec: number;
  dt: number;
  telemetry: typeof telemetry;
  bus: ScenarioEventBus;
  seed: number;
  setPilotInput: (p: Partial<PilotInput>) => void;
}

export type ScenarioEvent =
  | { type: 'started'; scenarioId: string }
  | { type: 'progress'; elapsedSec: number; metricValue: number }
  | { type: 'completed'; elapsedSec: number; metricValue: number }
  | { type: 'failed'; reason: 'timeout' | 'aborted'; elapsedSec: number };

export type ScenarioListener = (e: ScenarioEvent) => void;
export type ScenarioCategory = 'mission' | 'experiment';

export interface SetupContext {
  bus: ScenarioEventBus;
  seed: number;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category?: ScenarioCategory;
  setup: (ctx: SetupContext) => ReactNode;
  initialPose?: RobotResetPose;
  metric: (ctx: ScenarioContext) => number;
  goal: (ctx: ScenarioContext) => boolean;
  timeoutSec: number;
  completeOnTimeout?: boolean;
  isAutonomyAllowed: boolean;
  reset?: (seed: number) => void;
  summary?: (ctx: ScenarioContext) => Record<string, number>;
  pilot?: (ctx: ScenarioContext) => void;
  /**
   * Координаты цели, на которую наводится FSM, либо `null` если у миссии цели нет.
   * Только из этой дельты считается `rangeMeters` для SEARCH↔ENGAGE — лидар видит
   * любые препятствия и не годится как сигнал атаки.
   * Возвращающее `null` (или отсутствие метода) удерживает FSM в SEARCH.
   */
  targetForFsm?: (ctx: ScenarioContext) => { x: number; z: number } | null;
  /**
   * Сценарий сам пишет `telemetry.fsmState` (например, эксперимент `fsmVsBt`,
   * где FSM является объектом исследования). При `true` ScenarioRunner не
   * создаёт собственный экземпляр FSM и не трогает `telemetry.fsmState`.
   */
  managesFsmState?: boolean;
}

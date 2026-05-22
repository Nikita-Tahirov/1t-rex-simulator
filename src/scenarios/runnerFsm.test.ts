import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { telemetry } from '@/store/telemetry.ts';
import { ScenarioEventBus, ScenarioRunner } from './manager.ts';
import type { Scenario } from './scenario-types.ts';

/**
 * Регрессия на гибридную интеграцию FSM (вариант В): ScenarioRunner ведёт
 * BehaviorFSM по физическому контексту, кроме сценариев с managesFsmState=true.
 * В свободном режиме (без active runner) telemetry.fsmState остаётся 'IDLE'.
 */

const farAwayTarget = { x: 100, z: 100 };
const closeTarget = { x: 0.2, z: 0 };

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'fsm-runner-test',
    title: 'FSM runner regression',
    description: 'fixture',
    setup: () => null,
    metric: () => 0,
    goal: () => false,
    timeoutSec: 100,
    isAutonomyAllowed: true,
    ...overrides,
  };
}

function resetTelemetryPose(): void {
  telemetry.positionX = 0;
  telemetry.positionZ = 0;
  telemetry.filteredRoll = 0;
  telemetry.batterySoc = 1;
  telemetry.fsmState = 'IDLE';
  telemetry.fsmLastTransition = '';
}

describe('ScenarioRunner FSM integration', () => {
  beforeEach(() => {
    resetTelemetryPose();
  });

  afterEach(() => {
    resetTelemetryPose();
  });

  it('start() переводит telemetry.fsmState из IDLE в SEARCH', () => {
    const runner = new ScenarioRunner(makeScenario(), new ScenarioEventBus(), 1);
    expect(telemetry.fsmState).toBe('IDLE');
    runner.start();
    expect(telemetry.fsmState).toBe('SEARCH');
  });

  it('targetForFsm близкая → SEARCH переходит в ENGAGE на tick()', () => {
    const runner = new ScenarioRunner(
      makeScenario({ targetForFsm: () => closeTarget }),
      new ScenarioEventBus(),
      1,
    );
    runner.start();
    expect(telemetry.fsmState).toBe('SEARCH');
    runner.tick(1 / 60);
    expect(telemetry.fsmState).toBe('ENGAGE');
  });

  it('targetForFsm далеко → FSM остаётся в SEARCH', () => {
    const runner = new ScenarioRunner(
      makeScenario({ targetForFsm: () => farAwayTarget }),
      new ScenarioEventBus(),
      1,
    );
    runner.start();
    for (let i = 0; i < 30; i++) runner.tick(1 / 60);
    expect(telemetry.fsmState).toBe('SEARCH');
  });

  it('isFlipped (|filteredRoll| > π/2) → RECOVERY', () => {
    const runner = new ScenarioRunner(makeScenario(), new ScenarioEventBus(), 1);
    runner.start();
    telemetry.filteredRoll = Math.PI * 0.75;
    runner.tick(1 / 60);
    expect(telemetry.fsmState).toBe('RECOVERY');
  });

  it('низкий batterySoc → RECOVERY', () => {
    const runner = new ScenarioRunner(makeScenario(), new ScenarioEventBus(), 1);
    runner.start();
    telemetry.batterySoc = 0.05;
    runner.tick(1 / 60);
    expect(telemetry.fsmState).toBe('RECOVERY');
  });

  it('abort() возвращает telemetry.fsmState в IDLE', () => {
    const runner = new ScenarioRunner(makeScenario(), new ScenarioEventBus(), 1);
    runner.start();
    expect(telemetry.fsmState).toBe('SEARCH');
    runner.abort();
    expect(telemetry.fsmState).toBe('IDLE');
  });

  it('завершение по таймауту возвращает telemetry.fsmState в IDLE', () => {
    const runner = new ScenarioRunner(
      makeScenario({ timeoutSec: 0.05, completeOnTimeout: true }),
      new ScenarioEventBus(),
      1,
    );
    runner.start();
    runner.tick(0.1);
    expect(telemetry.fsmState).toBe('IDLE');
  });

  it('managesFsmState=true: runner не трогает telemetry.fsmState', () => {
    telemetry.fsmState = 'IDLE';
    const runner = new ScenarioRunner(
      makeScenario({ managesFsmState: true, targetForFsm: () => closeTarget }),
      new ScenarioEventBus(),
      1,
    );
    runner.start();
    // start() обычно бы шёл engage и SEARCH, но managesFsmState=true → не трогает
    expect(telemetry.fsmState).toBe('IDLE');
    runner.tick(1 / 60);
    expect(telemetry.fsmState).toBe('IDLE');
  });

  it('конструктор сбрасывает остаточный fsmState предыдущего сценария', () => {
    telemetry.fsmState = 'ENGAGE';
    new ScenarioRunner(makeScenario(), new ScenarioEventBus(), 1);
    expect(telemetry.fsmState).toBe('IDLE');
  });
});

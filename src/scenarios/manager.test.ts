import { describe, expect, it, vi } from 'vitest';
import { useScenarioStore } from '@/store/scenario-store.ts';
import {
  SCENARIO_GROUPS,
  SCENARIO_LIST,
  type Scenario,
  ScenarioEventBus,
  ScenarioRunner,
} from './manager.ts';
import { pickTargetPosition } from './targetPosition.ts';

const baseScenario: Scenario = {
  id: 'test',
  title: 'Test',
  description: 'Test scenario',
  setup: () => null,
  metric: (ctx) => ctx.seed + ctx.bus.count('event') + ctx.telemetry.speed,
  goal: () => false,
  timeoutSec: 1,
  isAutonomyAllowed: false,
};

describe('ScenarioRunner credibility hooks', () => {
  it('stores deterministic seed in runner context', () => {
    const runner = new ScenarioRunner(baseScenario, new ScenarioEventBus(), 12345);

    expect(runner.seed).toBe(12345);
  });

  it('keeps search-and-strike setup deterministic via seed', () => {
    const a = pickTargetPosition(20260428);
    const b = pickTargetPosition(20260428);
    const c = pickTargetPosition(20260429);

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('ScenarioEventBus extended API', () => {
  it('set() overwrites value (unlike emit which adds)', () => {
    const bus = new ScenarioEventBus();
    bus.emit('rmse', 5);
    bus.emit('rmse', 7);
    expect(bus.count('rmse')).toBe(12); // 5+7 (additive)
    bus.set('rmse', 0.42);
    expect(bus.count('rmse')).toBe(0.42);
    expect(bus.get('rmse')).toBe(0.42);
  });

  it('get() returns fallback for missing keys', () => {
    const bus = new ScenarioEventBus();
    expect(bus.get('nope')).toBe(0);
    expect(bus.get('nope', -1)).toBe(-1);
  });

  it('keys() lists registered metric names', () => {
    const bus = new ScenarioEventBus();
    bus.set('a', 1);
    bus.emit('b');
    expect(new Set(bus.keys())).toEqual(new Set(['a', 'b']));
  });

  it('reset() clears all values', () => {
    const bus = new ScenarioEventBus();
    bus.set('x', 1);
    bus.emit('y');
    bus.reset();
    expect(bus.keys()).toHaveLength(0);
  });
});

describe('Scenario.reset and Scenario.summary hooks', () => {
  it('runner calls scenario.reset(seed) on start', () => {
    const resetSpy = vi.fn();
    const scen: Scenario = { ...baseScenario, reset: resetSpy };
    const runner = new ScenarioRunner(scen, new ScenarioEventBus(), 42);
    runner.start();
    expect(resetSpy).toHaveBeenCalledWith(42);
  });

  it('runner publishes scenario.summary() to scenario-store on completion', () => {
    const scen: Scenario = {
      ...baseScenario,
      goal: (ctx) => ctx.elapsedSec >= 0.05,
      summary: () => ({ kpi_alpha: 1.5, kpi_beta: 2.5 }),
    };
    const runner = new ScenarioRunner(scen, new ScenarioEventBus(), 1);
    runner.start();
    runner.tick(0.1); // > 0.05 → goal true → completed
    const stored = useScenarioStore.getState().summary;
    expect(stored.kpi_alpha).toBe(1.5);
    expect(stored.kpi_beta).toBe(2.5);
  });

  it('runner publishes summary on timeout failure', () => {
    const scen: Scenario = {
      ...baseScenario,
      timeoutSec: 0.05,
      summary: () => ({ partial: 7 }),
    };
    const runner = new ScenarioRunner(scen, new ScenarioEventBus(), 1);
    runner.start();
    runner.tick(0.1); // > timeout → failed
    expect(useScenarioStore.getState().summary.partial).toBe(7);
  });

  it('runner treats completeOnTimeout scenarios as completed experiments', () => {
    const scen: Scenario = {
      ...baseScenario,
      timeoutSec: 0.05,
      completeOnTimeout: true,
      summary: () => ({ samples: 10 }),
    };
    const runner = new ScenarioRunner(scen, new ScenarioEventBus(), 1);
    runner.start();
    runner.tick(0.1);
    expect(useScenarioStore.getState().status).toBe('completed');
    expect(useScenarioStore.getState().message).toContain('Окно измерения');
  });

  it('runner survives summary() throwing error', () => {
    const scen: Scenario = {
      ...baseScenario,
      goal: () => true,
      summary: () => {
        throw new Error('intentional');
      },
    };
    const runner = new ScenarioRunner(scen, new ScenarioEventBus(), 1);
    expect(() => {
      runner.start();
      runner.tick(0.01);
    }).not.toThrow();
  });
});

describe('Scenario registry and groups', () => {
  it('SCENARIO_LIST contains 7 scenarios', () => {
    expect(SCENARIO_LIST).toHaveLength(7);
  });

  it('SCENARIO_GROUPS splits into mission and experiment', () => {
    const mission = SCENARIO_GROUPS.find((g) => g.id === 'mission');
    const experiment = SCENARIO_GROUPS.find((g) => g.id === 'experiment');
    expect(mission?.items.length).toBe(4);
    expect(experiment?.items.length).toBe(3);
  });

  it('all experiments have category set to "experiment"', () => {
    const experiment = SCENARIO_GROUPS.find((g) => g.id === 'experiment');
    expect(experiment?.items.every((s) => s.category === 'experiment')).toBe(true);
  });

  it('every experiment exposes summary() hook', () => {
    const experiment = SCENARIO_GROUPS.find((g) => g.id === 'experiment');
    expect(experiment?.items.every((s) => typeof s.summary === 'function')).toBe(true);
  });

  it('exports unique scenario ids', () => {
    const ids = SCENARIO_LIST.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('scenario-store summary export', () => {
  it('exportLog includes summary when non-empty', async () => {
    useScenarioStore.getState().setSummary({ kpi_x: 3.14 });
    const blob = useScenarioStore.getState().exportLog();
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.summary).toEqual({ kpi_x: 3.14 });
  });

  it('exportLog omits summary when empty', async () => {
    useScenarioStore.getState().setSummary({});
    const blob = useScenarioStore.getState().exportLog();
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.summary).toBeUndefined();
  });

  it('exportLog includes verification when present', async () => {
    useScenarioStore.getState().setVerification({
      scenarioId: 'test',
      passed: true,
      score: 1,
      checks: [],
      observed: {},
    });
    const blob = useScenarioStore.getState().exportLog();
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.verification.passed).toBe(true);
    useScenarioStore.getState().setVerification(null);
  });
});

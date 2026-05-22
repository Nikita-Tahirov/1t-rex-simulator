import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '@/store/sim-store.ts';
import { telemetry } from '@/store/telemetry.ts';
import { _testHelpers, fsmVsBt } from './fsmVsBt.tsx';
import { ScenarioEventBus, ScenarioRunner } from './manager.ts';

const SEED = 20260428;

function ctxStub(elapsedSec: number, bus: ScenarioEventBus) {
  return { elapsedSec, dt: 0, telemetry, bus, seed: SEED, setPilotInput: () => {} };
}

describe('fsmVsBt scenario', () => {
  afterEach(() => {
    useSimStore.setState({ mode: 'manual' });
    _testHelpers().resetRunState('manual');
  });

  it('exposes correct metadata', () => {
    expect(fsmVsBt.id).toBe('fsmVsBt');
    expect(fsmVsBt.category).toBe('experiment');
    expect(fsmVsBt.isAutonomyAllowed).toBe(true);
    expect(fsmVsBt.timeoutSec).toBeGreaterThan(30);
  });

  it('reset() snapshots the current control mode at start (FSM)', () => {
    useSimStore.setState({ mode: 'fsm' });
    fsmVsBt.reset?.(SEED);
    expect(_testHelpers().getRunState()?.modeAtStart).toBe(1);
  });

  it('reset() snapshots BT mode correctly', () => {
    useSimStore.setState({ mode: 'bt' });
    fsmVsBt.reset?.(SEED);
    expect(_testHelpers().getRunState()?.modeAtStart).toBe(2);
  });

  it('records first hit timestamp via bus event', () => {
    useSimStore.setState({ mode: 'bt' });
    const runner = new ScenarioRunner(fsmVsBt, new ScenarioEventBus(), SEED);
    runner.start();
    // Несколько тиков без событий.
    for (let i = 0; i < 60; i++) runner.tick(1 / 60);
    expect(_testHelpers().getRunState()?.tFirstHit).toBeNull();
    // Эмитим хит — следующий тик должен зафиксировать tFirstHit.
    runner.bus.emit('targetHit');
    runner.tick(1 / 60);
    const t = _testHelpers().getRunState()?.tFirstHit;
    expect(t).not.toBeNull();
    if (typeof t === 'number') {
      expect(t).toBeGreaterThan(0.9);
      expect(t).toBeLessThan(1.5);
    }
  });

  it('keeps FSM engage driving until a physical target hit is reported', () => {
    useSimStore.setState({ mode: 'fsm' });
    fsmVsBt.reset?.(SEED);
    const state = _testHelpers().getRunState();
    expect(state).not.toBeNull();
    if (!state) return;

    telemetry.positionX = state.targetX - 0.08;
    telemetry.positionZ = state.targetZ;
    telemetry.yaw = 0;
    const setPilotInput = vi.fn();
    fsmVsBt.pilot?.({
      elapsedSec: 2,
      dt: 1 / 60,
      telemetry,
      bus: new ScenarioEventBus(),
      seed: SEED,
      setPilotInput,
    });

    expect(setPilotInput).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, throttle: expect.any(Number) }),
    );
    expect(setPilotInput.mock.calls[0]?.[0].throttle).toBeGreaterThan(0.2);
  });

  it('summary captures mode + t_to_hit + collisions', () => {
    useSimStore.setState({ mode: 'fsm' });
    fsmVsBt.reset?.(SEED);
    const bus = new ScenarioEventBus();
    bus.emit('targetHit');
    bus.emit('obstacleCollision');
    bus.emit('obstacleCollision');
    // Симулируем что хит произошёл (через runState).
    _testHelpers().resetRunState('fsm');
    const runState = _testHelpers().getRunState();
    if (runState) runState.tFirstHit = 12.3;

    const summary = fsmVsBt.summary?.(ctxStub(15, bus));
    expect(summary).toBeDefined();
    if (!summary) return;
    expect(summary.mode).toBe(1);
    expect(summary.t_to_hit_sec).toBeCloseTo(12.3, 3);
    expect(summary.hit_succeeded).toBe(1);
    expect(summary.obstacle_collisions).toBe(2);
  });

  it('summary marks miss with t_to_hit_sec = -1', () => {
    useSimStore.setState({ mode: 'bt' });
    fsmVsBt.reset?.(SEED);
    const bus = new ScenarioEventBus();
    const summary = fsmVsBt.summary?.(ctxStub(45, bus));
    expect(summary?.t_to_hit_sec).toBe(-1);
    expect(summary?.hit_succeeded).toBe(0);
    expect(summary?.mode).toBe(2);
  });
});

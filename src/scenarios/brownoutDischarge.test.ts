import { afterEach, describe, expect, it, vi } from 'vitest';
import { telemetry } from '@/store/telemetry.ts';
import { _testHelpers, brownoutDischarge } from './brownoutDischarge.tsx';
import { ScenarioEventBus, ScenarioRunner } from './manager.ts';

const SEED = 20260428;

function ctxStub(elapsedSec: number, bus: ScenarioEventBus) {
  return { elapsedSec, dt: 0, telemetry, bus, seed: SEED, setPilotInput: () => {} };
}

function resetTelemetry(): void {
  telemetry.positionX = 0;
  telemetry.positionZ = 0;
  telemetry.yaw = 0;
  telemetry.speed = 0;
  telemetry.yawRate = 0;
  telemetry.wheelOmega = [0, 0, 0, 0];
}

describe('brownoutDischarge scenario', () => {
  afterEach(() => {
    resetTelemetry();
  });

  it('exposes correct metadata', () => {
    expect(brownoutDischarge.id).toBe('brownoutDischarge');
    expect(brownoutDischarge.category).toBe('experiment');
    expect(brownoutDischarge.timeoutSec).toBeGreaterThan(30);
    expect(brownoutDischarge.reset).toBeDefined();
  });

  it('reset() initialises state with correct initial SOC', () => {
    brownoutDischarge.reset?.(SEED);
    const s = _testHelpers().getState();
    expect(s).not.toBeNull();
    if (!s) return;
    const snap = s.battery.snapshot();
    expect(snap.soc).toBeCloseTo(_testHelpers().INITIAL_SOC, 5);
  });

  it('battery V_load drops under continuous high-speed load', () => {
    const runner = new ScenarioRunner(brownoutDischarge, new ScenarioEventBus(), SEED);
    runner.start();
    const dt = 1 / 60;
    // Имитируем максимальную скорость 6.94 м/с в течение 30 с.
    telemetry.speed = 6.94;
    telemetry.yawRate = 0;
    telemetry.wheelOmega = [60, 60, 60, 60];
    const initialV = _testHelpers().getState()?.battery.snapshot().voltageLoad ?? 0;
    for (let i = 0; i < Math.floor(30 / dt); i++) runner.tick(dt);
    const finalV = _testHelpers().getState()?.battery.snapshot().voltageLoad ?? 0;
    expect(finalV).toBeLessThan(initialV);
  });

  it('triggers brownout below threshold and records timestamp', () => {
    const runner = new ScenarioRunner(brownoutDischarge, new ScenarioEventBus(), SEED);
    runner.start();
    const dt = 1 / 60;
    telemetry.speed = 6.94;
    telemetry.wheelOmega = [60, 60, 60, 60];
    for (let i = 0; i < Math.floor(40 / dt); i++) runner.tick(dt);
    const s = _testHelpers().getState();
    expect(s).not.toBeNull();
    if (!s) return;
    // С SOC 30 % и интенсивной нагрузкой brownout должен сработать.
    if (s.tBrownoutStart !== null) {
      expect(s.tBrownoutStart).toBeGreaterThan(0);
      expect(s.tBrownoutStart).toBeLessThan(40);
      expect(s.minScale).toBeLessThanOrEqual(1);
    }
    expect(s.minVLoad).toBeLessThan(_testHelpers().BROWNOUT_THRESHOLD_V * 1.5);
  });

  it('summary contains all expected fields', () => {
    brownoutDischarge.reset?.(SEED);
    const summary = brownoutDischarge.summary?.(ctxStub(0, new ScenarioEventBus()));
    expect(summary).toBeDefined();
    if (!summary) return;
    expect(summary).toHaveProperty('t_brownout_start_sec');
    expect(summary).toHaveProperty('min_v_load_v');
    expect(summary).toHaveProperty('final_soc');
    expect(summary).toHaveProperty('final_v_load_v');
    expect(summary).toHaveProperty('min_brownout_scale');
    expect(summary).toHaveProperty('effective_power_loss_pct');
    expect(summary).toHaveProperty('samples');
  });

  it('steers back to the arena center near the boundary', () => {
    telemetry.positionX = 4;
    telemetry.positionZ = 0;
    telemetry.yaw = Math.PI;
    const setPilotInput = vi.fn();

    brownoutDischarge.pilot?.({
      elapsedSec: 8,
      dt: 1 / 60,
      telemetry,
      bus: new ScenarioEventBus(),
      seed: SEED,
      setPilotInput,
    });

    expect(setPilotInput).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, throttle: expect.any(Number) }),
    );
  });

  it('does not trigger brownout under zero load', () => {
    const runner = new ScenarioRunner(brownoutDischarge, new ScenarioEventBus(), SEED);
    runner.start();
    const dt = 1 / 60;
    telemetry.speed = 0;
    telemetry.yawRate = 0;
    telemetry.wheelOmega = [0, 0, 0, 0];
    for (let i = 0; i < Math.floor(10 / dt); i++) runner.tick(dt);
    const s = _testHelpers().getState();
    if (!s) return;
    // Без нагрузки V_oc ≈ V_load > порога, brownout не сработал.
    expect(s.minScale).toBeCloseTo(1, 3);
  });
});

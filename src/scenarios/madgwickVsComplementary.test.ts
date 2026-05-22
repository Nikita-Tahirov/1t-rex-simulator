import { afterEach, describe, expect, it } from 'vitest';
import { telemetry } from '@/store/telemetry.ts';
import { _testHelpers, madgwickVsComplementary } from './madgwickVsComplementary.tsx';
import { ScenarioEventBus, ScenarioRunner } from './manager.ts';

const SEED = 20260428;

function makeRunner(seed = SEED): ScenarioRunner {
  return new ScenarioRunner(madgwickVsComplementary, new ScenarioEventBus(), seed);
}

function resetTelemetry(): void {
  telemetry.positionX = 0;
  telemetry.positionY = 0;
  telemetry.positionZ = 0;
  telemetry.roll = 0;
  telemetry.pitch = 0;
  telemetry.yaw = 0;
  telemetry.speed = 0;
  telemetry.yawRate = 0;
}

describe('madgwickVsComplementary scenario', () => {
  afterEach(() => {
    _testHelpers().resetState(SEED);
    resetTelemetry();
  });

  it('exposes expected metadata', () => {
    expect(madgwickVsComplementary.id).toBe('madgwickVsComplementary');
    expect(madgwickVsComplementary.category).toBe('experiment');
    expect(madgwickVsComplementary.timeoutSec).toBeGreaterThan(0);
    expect(madgwickVsComplementary.reset).toBeDefined();
    expect(madgwickVsComplementary.summary).toBeDefined();
  });

  it('reset() seeds deterministic IMU and zeroes accumulators', () => {
    madgwickVsComplementary.reset?.(SEED);
    const s = _testHelpers().getState();
    expect(s).not.toBeNull();
    expect(s?.samples).toBe(0);
    expect(s?.sumSqErrMadgwick).toBe(0);
    expect(s?.sumSqErrComp).toBe(0);
  });

  it('summary returns no-data marker when nothing was sampled', () => {
    madgwickVsComplementary.reset?.(SEED);
    const ctx = {
      elapsedSec: 0,
      dt: 0,
      telemetry,
      bus: new ScenarioEventBus(),
      seed: SEED,
      setPilotInput: () => {},
    };
    const out = madgwickVsComplementary.summary?.(ctx);
    expect(out?.error_no_data).toBe(1);
    expect(out?.samples).toBe(0);
  });

  it('accumulates non-zero RMSE for both filters under yaw rotation', () => {
    const runner = makeRunner();
    runner.start();
    // Имитируем поворот робота на 360° за 4 секунды.
    const totalTime = 4;
    const dt = 1 / 60;
    const steps = Math.floor(totalTime / dt);
    const omega = (2 * Math.PI) / totalTime; // 360° за 4 с
    for (let i = 0; i < steps; i++) {
      const t = i * dt;
      telemetry.yaw = ((omega * t + Math.PI) % (2 * Math.PI)) - Math.PI; // wrap to (-π, π]
      telemetry.yawRate = omega;
      telemetry.speed = 0;
      runner.tick(dt);
    }
    const s = _testHelpers().getState();
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.samples).toBeGreaterThan(100);
    // Комплементарный фильтр не имеет yaw-канала → ошибка большая.
    const rmseM = Math.sqrt(s.sumSqErrMadgwick / s.samples);
    const rmseC = Math.sqrt(s.sumSqErrComp / s.samples);
    expect(rmseC).toBeGreaterThan(rmseM); // принципиальная разница фильтров
    expect(rmseC).toBeGreaterThan(0.1); // > 5° по yaw — комплементарный заведомо хуже
  });

  it('records yaw_range_deg when robot rotates', () => {
    const runner = makeRunner();
    runner.start();
    const dt = 1 / 60;
    // 720° за 4 секунды
    const totalTime = 4;
    const omega = (4 * Math.PI) / totalTime;
    const steps = Math.floor(totalTime / dt);
    for (let i = 0; i < steps; i++) {
      const t = i * dt;
      const yawRaw = omega * t;
      telemetry.yaw = ((yawRaw + Math.PI) % (2 * Math.PI)) - Math.PI;
      telemetry.yawRate = omega;
      runner.tick(dt);
    }
    const ctx = {
      elapsedSec: totalTime,
      dt,
      telemetry,
      bus: runner.bus,
      seed: SEED,
      setPilotInput: () => {},
    };
    const summary = madgwickVsComplementary.summary?.(ctx);
    expect(summary).toBeDefined();
    if (!summary) return;
    expect(summary.yaw_range_deg).toBeGreaterThan(700); // должно быть около 720°
    expect(summary.samples).toBeGreaterThan(100);
    // Не должно быть warning — диапазон достаточен.
    expect(summary.warning_low_yaw_range).toBeUndefined();
  });

  it('flags warning when yaw range is below 90°', () => {
    const runner = makeRunner();
    runner.start();
    const dt = 1 / 60;
    // Очень малая ротация
    const totalTime = 2;
    const omega = Math.PI / 4 / totalTime; // 45° за 2 с
    const steps = Math.floor(totalTime / dt);
    for (let i = 0; i < steps; i++) {
      const t = i * dt;
      telemetry.yaw = omega * t;
      telemetry.yawRate = omega;
      runner.tick(dt);
    }
    const ctx = {
      elapsedSec: totalTime,
      dt,
      telemetry,
      bus: runner.bus,
      seed: SEED,
      setPilotInput: () => {},
    };
    const summary = madgwickVsComplementary.summary?.(ctx);
    expect(summary?.warning_low_yaw_range).toBe(1);
  });
});

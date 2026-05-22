import { afterEach, describe, expect, it, vi } from 'vitest';
import { telemetry } from '@/store/telemetry.ts';
import { ScenarioEventBus } from './manager.ts';
import { obstacleAvoidance } from './obstacleAvoidance.tsx';

const SEED = 20260428;

function resetTelemetry(): void {
  telemetry.positionX = -3;
  telemetry.positionZ = 0;
  telemetry.yaw = 0;
  telemetry.speed = 0;
  telemetry.yawRate = 0;
}

describe('obstacleAvoidance scenario', () => {
  afterEach(() => {
    resetTelemetry();
  });

  it('starts by steering into the first slalom gate instead of driving straight', () => {
    resetTelemetry();
    const setPilotInput = vi.fn();

    obstacleAvoidance.pilot?.({
      elapsedSec: 0,
      dt: 1 / 60,
      telemetry,
      bus: new ScenarioEventBus(),
      seed: SEED,
      setPilotInput,
    });

    expect(setPilotInput).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        throttle: expect.any(Number),
        turn: expect.any(Number),
      }),
    );
    const command = setPilotInput.mock.calls[0]?.[0];
    expect(command?.turn).toBeGreaterThan(0.25);
  });

  it('aims down the safe corridor after reaching the first slalom lane', () => {
    resetTelemetry();
    const bus = new ScenarioEventBus();
    bus.set('obstaclePathProgress_e3', 2_500);
    bus.set('obstacleWaypointIndex', 3);
    const setPilotInput = vi.fn();

    telemetry.positionX = -0.9;
    telemetry.positionZ = 1.35;
    telemetry.speed = 1.2;
    obstacleAvoidance.pilot?.({
      elapsedSec: 2,
      dt: 1 / 60,
      telemetry,
      bus,
      seed: SEED,
      setPilotInput,
    });

    expect(bus.get('obstaclePathProgress_e3')).toBeGreaterThanOrEqual(2_500);
    expect(bus.get('obstacleWaypointIndex')).toBeGreaterThanOrEqual(4);
    const command = setPilotInput.mock.calls[0]?.[0];
    expect(command?.turn).toBeLessThan(-0.25);
  });

  it('does not skip solid-obstacle corridor waypoints by projection alone', () => {
    resetTelemetry();
    const bus = new ScenarioEventBus();
    const setPilotInput = vi.fn();
    bus.set('obstaclePathProgress_e3', 10_000);
    bus.set('obstacleWaypointIndex', 7);

    telemetry.positionX = 1.85;
    telemetry.positionZ = -0.5;
    telemetry.yaw = -0.4;
    obstacleAvoidance.pilot?.({
      elapsedSec: 16,
      dt: 1 / 60,
      telemetry,
      bus,
      seed: SEED,
      setPilotInput,
    });

    expect(bus.get('obstacleWaypointIndex')).toBe(7);
    expect(bus.get('obstaclePathProgress_e3')).toBeGreaterThanOrEqual(10_000);
    expect(setPilotInput).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
  });

  it('accepts a physically valid wide pass around the third obstacle', () => {
    resetTelemetry();
    const bus = new ScenarioEventBus();
    const setPilotInput = vi.fn();
    bus.set('obstaclePathProgress_e3', 10_157);
    bus.set('obstacleWaypointIndex', 10);

    telemetry.positionX = 1.18;
    telemetry.positionZ = 2.02;
    telemetry.yaw = -0.33;
    telemetry.speed = 1.8;
    obstacleAvoidance.pilot?.({
      elapsedSec: 4,
      dt: 1 / 60,
      telemetry,
      bus,
      seed: SEED,
      setPilotInput,
    });

    expect(bus.get('obstacleWaypointIndex')).toBeGreaterThan(10);
    expect(setPilotInput).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
  });

  it('does not complete at the finish unless the slalom waypoints were traversed', () => {
    resetTelemetry();
    telemetry.positionX = 3;
    telemetry.positionZ = 0;

    expect(
      obstacleAvoidance.goal({
        elapsedSec: 8,
        dt: 1 / 60,
        telemetry,
        bus: new ScenarioEventBus(),
        seed: SEED,
        setPilotInput: () => {},
      }),
    ).toBe(false);

    const bus = new ScenarioEventBus();
    bus.set('obstaclePathProgress_e3', 999_000);
    bus.set('obstacleWaypointIndex', 999);
    expect(
      obstacleAvoidance.goal({
        elapsedSec: 8,
        dt: 1 / 60,
        telemetry,
        bus,
        seed: SEED,
        setPilotInput: () => {},
      }),
    ).toBe(true);
  });
});

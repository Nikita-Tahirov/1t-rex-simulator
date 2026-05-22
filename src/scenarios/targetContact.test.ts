import { describe, expect, it } from 'vitest';
import { telemetry } from '@/store/telemetry.ts';
import { ScenarioEventBus } from './manager.ts';
import {
  emitTargetHitIfInContact,
  isRobotTargetContact,
  TARGET_CENTER_HIT_RADIUS_M,
} from './targetContact.ts';
import { pickTargetPosition } from './targetPosition.ts';

const SEED = 20260428;

function makeCtx(elapsedSec: number, bus = new ScenarioEventBus()) {
  return {
    elapsedSec,
    dt: 1 / 60,
    telemetry,
    bus,
    seed: SEED,
    setPilotInput: () => {},
  };
}

describe('target contact fallback', () => {
  it('emits targetHit when chassis center enters guaranteed contact radius', () => {
    const target = pickTargetPosition(SEED);
    const bus = new ScenarioEventBus();
    telemetry.positionX = target.x - TARGET_CENTER_HIT_RADIUS_M * 0.5;
    telemetry.positionZ = target.z;

    emitTargetHitIfInContact(makeCtx(1, bus));

    expect(bus.count('targetHit')).toBe(1);
  });

  it('does not emit targetHit during startup grace period', () => {
    const target = pickTargetPosition(SEED);
    const bus = new ScenarioEventBus();
    telemetry.positionX = target.x;
    telemetry.positionZ = target.z;

    emitTargetHitIfInContact(makeCtx(0.2, bus));

    expect(bus.count('targetHit')).toBe(0);
  });

  it('accepts only robot combat parts as collision target contacts', () => {
    expect(isRobotTargetContact('chassis')).toBe(true);
    expect(isRobotTargetContact('spinner')).toBe(true);
    expect(isRobotTargetContact('wheel')).toBe(false);
    expect(isRobotTargetContact('arena-static')).toBe(false);
    expect(isRobotTargetContact('damage-crate')).toBe(false);
    expect(isRobotTargetContact(undefined)).toBe(false);
  });
});

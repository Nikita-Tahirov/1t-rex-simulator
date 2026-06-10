import { describe, expect, it } from 'vitest';
import { computeDriveForces, type DriveParams, type DriveState } from './battleDrive.ts';

const PARAMS: DriveParams = {
  mass: 109,
  yawInertia: 15,
  maxSpeed: 6.94,
  maxYawRate: 3,
  driveForceMax: 1300,
  turnTorqueMax: 260,
  lateralGrip: 8,
  driveScale: 1,
};

const STILL: DriveState = { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0 };

describe('computeDriveForces', () => {
  it('газ вперёд из покоя даёт максимальную (ограниченную) тягу вперёд', () => {
    const out = computeDriveForces(STILL, { throttle: 1, turn: 0, brake: 0 }, PARAMS);
    expect(out.forwardForce).toBe(PARAMS.driveForceMax); // насыщение → удары проходят
  });

  it('на целевой скорости тяга гаснет', () => {
    const out = computeDriveForces(
      { forwardSpeed: PARAMS.maxSpeed, lateralSpeed: 0, yawRate: 0 },
      { throttle: 1, turn: 0, brake: 0 },
      PARAMS,
    );
    expect(out.forwardForce).toBeCloseTo(0, 5);
  });

  it('тормоз целит скорость в ноль (тяга назад при движении вперёд)', () => {
    const out = computeDriveForces(
      { forwardSpeed: 4, lateralSpeed: 0, yawRate: 0 },
      { throttle: 1, turn: 0, brake: 1 },
      PARAMS,
    );
    expect(out.forwardForce).toBeLessThan(0);
  });

  it('поворот направо даёт положительный момент, гаснущий на целевой угловой', () => {
    const turning = computeDriveForces(STILL, { throttle: 0, turn: 1, brake: 0 }, PARAMS);
    expect(turning.yawTorque).toBeGreaterThan(0);
    const atTarget = computeDriveForces(
      { forwardSpeed: 0, lateralSpeed: 0, yawRate: PARAMS.maxYawRate },
      { throttle: 0, turn: 1, brake: 0 },
      PARAMS,
    );
    expect(atTarget.yawTorque).toBeCloseTo(0, 5);
  });

  it('боковая скорость гасится силой противоположного знака (сцепление катков)', () => {
    const out = computeDriveForces(
      { forwardSpeed: 0, lateralSpeed: 2, yawRate: 0 },
      { throttle: 0, turn: 0, brake: 0 },
      PARAMS,
    );
    expect(out.lateralForce).toBeLessThan(0);
  });

  it('повреждения снижают целевую скорость через driveScale', () => {
    const full = computeDriveForces(STILL, { throttle: 1, turn: 0, brake: 0 }, PARAMS);
    const hurt = computeDriveForces(
      STILL,
      { throttle: 1, turn: 0, brake: 0 },
      {
        ...PARAMS,
        driveScale: 0.4,
      },
    );
    // при той же позиции меньшая цель → меньшая (или равная из-за насыщения) тяга на разгоне
    expect(hurt.forwardForce).toBeLessThanOrEqual(full.forwardForce);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BRIDGE_CENTER_Z,
  BRIDGE_LANDING_WEST_X,
  BRIDGE_RAMP_HEIGHT,
  BRIDGE_RAMP_LENGTH,
} from './arena/arenaData.ts';
import { terrainHeightAt } from './arena/terrainHeight.ts';
import { ROBOT } from './constants.ts';
import { FL, WHEEL_DEFS } from './robotDefs.ts';
import { computeRobotGroundPose, localPointToWorld } from './robotGroundPose.ts';

const WHEEL_GROUND_CLEARANCE =
  ROBOT.chassisStartHeight + (WHEEL_DEFS[FL]?.anchor[1] ?? 0) - ROBOT.wheelRadius;

describe('robot ground pose', () => {
  it('keeps the chassis level on flat floor', () => {
    const pose = computeRobotGroundPose(0, 0, 0);

    expect(pose.chassisY).toBeCloseTo(ROBOT.chassisStartHeight, 6);
    expect(pose.roll).toBeCloseTo(0, 6);
    expect(pose.pitch).toBeCloseTo(0, 6);
    expect(pose.yaw).toBeCloseTo(0, 6);
    expect(pose.rotation.x).toBeCloseTo(0, 6);
    expect(pose.rotation.y).toBeCloseTo(0, 6);
    expect(pose.rotation.z).toBeCloseTo(0, 6);
    expect(pose.rotation.w).toBeCloseTo(1, 6);
  });

  it('preserves the game yaw convention on flat floor', () => {
    const pose = computeRobotGroundPose(0, 0, Math.PI / 2);

    expect(pose.roll).toBeCloseTo(0, 6);
    expect(pose.pitch).toBeCloseTo(0, 6);
    expect(angleDiff(pose.yaw, Math.PI / 2)).toBeCloseTo(0, 6);
    expect(pose.xAxis.x).toBeCloseTo(0, 6);
    expect(pose.xAxis.z).toBeCloseTo(1, 6);
  });

  it('pitches the robot up on the west bridge ramp', () => {
    const rampCenterX = BRIDGE_LANDING_WEST_X + BRIDGE_RAMP_LENGTH / 2;
    const pose = computeRobotGroundPose(rampCenterX, BRIDGE_CENTER_Z, 0);
    const expectedPitch = Math.atan2(BRIDGE_RAMP_HEIGHT, BRIDGE_RAMP_LENGTH);

    expect(pose.pitch).toBeCloseTo(expectedPitch, 3);
    expect(pose.roll).toBeCloseTo(0, 6);
  });

  it('pitches the robot down when it faces downhill on the same ramp', () => {
    const rampCenterX = BRIDGE_LANDING_WEST_X + BRIDGE_RAMP_LENGTH / 2;
    const pose = computeRobotGroundPose(rampCenterX, BRIDGE_CENTER_Z, Math.PI);
    const expectedPitch = -Math.atan2(BRIDGE_RAMP_HEIGHT, BRIDGE_RAMP_LENGTH);

    expect(pose.pitch).toBeCloseTo(expectedPitch, 3);
    expect(pose.roll).toBeCloseTo(0, 6);
  });

  it('preserves input yaw on tilted ground (no auto-yaw drift)', () => {
    // На пандусе сектора D + асимметричный заход (немного off-center по Z).
    // Раньше Gram-Schmidt в computeRobotGroundPose выдавал rotation, из которого
    // atan2(xAxis.z, xAxis.x) ≠ input yaw → drift впечатывался в кинематический
    // rotation робота через setNextKinematicRotation, на следующем кадре
    // currentYaw уже сбит, positive feedback разворачивал шасси поперёк моста.
    const rampCenterX = BRIDGE_LANDING_WEST_X + BRIDGE_RAMP_LENGTH / 2;
    for (const yawIn of [0, Math.PI / 6, Math.PI / 3, -Math.PI / 4, Math.PI]) {
      const pose = computeRobotGroundPose(rampCenterX, BRIDGE_CENTER_Z + 0.1, yawIn);
      // Сохранение yaw — корневой инвариант. Эквивалентный угол сравнивается через
      // (sin, cos) чтобы исключить ±2π wrap.
      expect(Math.sin(pose.yaw)).toBeCloseTo(Math.sin(yawIn), 6);
      expect(Math.cos(pose.yaw)).toBeCloseTo(Math.cos(yawIn), 6);
      // forward-проекция на плоскость XZ должна совпадать с input forward, то
      // есть chassis после setNextKinematicRotation вернёт тот же yaw на чтении.
      const fx = pose.xAxis.x;
      const fz = pose.xAxis.z;
      const yawFromForward = Math.atan2(fz, fx);
      expect(Math.sin(yawFromForward)).toBeCloseTo(Math.sin(yawIn), 6);
      expect(Math.cos(yawFromForward)).toBeCloseTo(Math.cos(yawIn), 6);
    }
  });

  it('keeps wheel centers matched to the ramp surface profile', () => {
    const rampCenterX = BRIDGE_LANDING_WEST_X + BRIDGE_RAMP_LENGTH / 2;
    const pose = computeRobotGroundPose(rampCenterX, BRIDGE_CENTER_Z, 0);
    const center = { x: rampCenterX, y: pose.chassisY, z: BRIDGE_CENTER_Z };

    for (const wheel of WHEEL_DEFS) {
      const wheelCenter = localPointToWorld(pose, center, wheel.anchor);
      const wheelBottomY = wheelCenter.y - ROBOT.wheelRadius;
      const groundY = terrainHeightAt(wheelCenter.x, wheelCenter.z);

      expect(wheelBottomY - groundY).toBeCloseTo(WHEEL_GROUND_CLEARANCE, 6);
    }
  });
});

function angleDiff(actual: number, expected: number): number {
  return Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected));
}

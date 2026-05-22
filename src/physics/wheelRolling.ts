import type { RapierRigidBody } from '@react-three/rapier';
import type { RefObject } from 'react';
import type { Quaternion } from 'three';
import { ROBOT } from './constants.ts';
import {
  type BodyVelocity,
  bodyToWheels,
  type VehicleGeometry,
  type WheelSpeeds,
} from './kinematics.ts';

const WHEEL_ROLLING_LINEAR_EPS = 0.005;
const WHEEL_ROLLING_ANGULAR_EPS = 0.005;

const DEFAULT_GEOMETRY: VehicleGeometry = {
  wheelbase: ROBOT.wheelbase,
  trackWidth: ROBOT.trackWidth,
  wheelRadius: ROBOT.wheelRadius,
};

export function rollingWheelSpeedsFromBodyVelocity(
  body: BodyVelocity,
  geometry: VehicleGeometry = DEFAULT_GEOMETRY,
): [number, number, number, number] {
  const linear = Math.abs(body.linear) < WHEEL_ROLLING_LINEAR_EPS ? 0 : body.linear;
  const angular = Math.abs(body.angular) < WHEEL_ROLLING_ANGULAR_EPS ? 0 : body.angular;
  if (linear === 0 && angular === 0) return [0, 0, 0, 0];

  const wheels = bodyToWheels({ linear, angular }, geometry);
  return [wheels.frontLeft, wheels.frontRight, wheels.rearLeft, wheels.rearRight];
}

/** In-place вариант для hot path: пишет ω колёс в переданный кортеж. */
export function rollingWheelSpeedsFromBodyVelocityInto(
  out: [number, number, number, number],
  body: BodyVelocity,
  geometry: VehicleGeometry = DEFAULT_GEOMETRY,
): void {
  const linear = Math.abs(body.linear) < WHEEL_ROLLING_LINEAR_EPS ? 0 : body.linear;
  const angular = Math.abs(body.angular) < WHEEL_ROLLING_ANGULAR_EPS ? 0 : body.angular;
  if (linear === 0 && angular === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    return;
  }
  const halfTurn = (angular * geometry.trackWidth) / 2;
  const leftSide = (linear - halfTurn) / geometry.wheelRadius;
  const rightSide = (linear + halfTurn) / geometry.wheelRadius;
  out[0] = leftSide;
  out[1] = rightSide;
  out[2] = leftSide;
  out[3] = rightSide;
}

export function wheelSpeedsTuple(wheels: WheelSpeeds): [number, number, number, number] {
  return [wheels.frontLeft, wheels.frontRight, wheels.rearLeft, wheels.rearRight];
}

/** In-place вариант: копирует ω сторон в переданный кортеж в порядке [FL, FR, RL, RR]. */
export function wheelSpeedsTupleInto(
  out: [number, number, number, number],
  wheels: WheelSpeeds,
): void {
  out[0] = wheels.frontLeft;
  out[1] = wheels.frontRight;
  out[2] = wheels.rearLeft;
  out[3] = wheels.rearRight;
}

export function advanceRollingWheelAngles(
  angles: [number, number, number, number],
  wheelOmega: readonly [number, number, number, number],
  dt: number,
): void {
  for (let i = 0; i < angles.length; i += 1) {
    angles[i] = (angles[i] ?? 0) + (wheelOmega[i] ?? 0) * dt;
  }
}

export function applyRollingWheelPose(
  wheelRefs: readonly RefObject<RapierRigidBody>[],
  baseRotation: { x: number; y: number; z: number; w: number },
  angles: readonly [number, number, number, number],
  scratchRotation: Quaternion,
  scratchRoll: Quaternion,
): void {
  for (let i = 0; i < wheelRefs.length; i += 1) {
    const wheel = wheelRefs[i]?.current;
    if (!wheel) continue;
    const halfAngle = (angles[i] ?? 0) / 2;
    scratchRoll.set(0, 0, Math.sin(halfAngle), Math.cos(halfAngle));
    scratchRotation
      .set(baseRotation.x, baseRotation.y, baseRotation.z, baseRotation.w)
      .multiply(scratchRoll);
    wheel.setRotation(scratchRotation, true);
    wheel.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}

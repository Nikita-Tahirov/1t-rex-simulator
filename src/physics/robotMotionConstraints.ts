import { clamp } from '@/lib/math.ts';
import {
  ROBOT_DAMAGE_FOOTPRINT_RADIUS,
  SHREDDER_BLADE_HALF,
  SHREDDER_CENTER,
  SHREDDER_HUB_RADIUS,
  SHREDDER_ROTATION_SPEED,
} from './arena/arenaData.ts';
import { ROBOT } from './constants.ts';

export interface PlanarMotionRequest {
  currentX: number;
  currentZ: number;
  desiredX: number;
  desiredZ: number;
  yaw: number;
  rotorAngle?: number;
  dt?: number;
}

export interface PlanarMotionResult {
  x: number;
  z: number;
  blockedBy: 'shredder' | null;
  penetration: number;
  impactSpeedMps: number;
}

const SHREDDER_CONTACT_MARGIN = 0.045;
export const SHREDDER_SWEEP_RADIUS = SHREDDER_HUB_RADIUS + SHREDDER_CONTACT_MARGIN;

const CHASSIS_HALF_X = ROBOT.chassisLength / 2;
const CHASSIS_HALF_Z = ROBOT.chassisWidth / 2;
const SHREDDER_BLADE_PUSH_SCALE = 0.7;
const SHREDDER_BLADE_PUSH_CAP_M = 0.12;

export function constrainRobotPlanarMotion(request: PlanarMotionRequest): PlanarMotionResult {
  return resolveShredderSweep({
    x: request.desiredX,
    z: request.desiredZ,
    yaw: request.yaw,
    rotorAngle: request.rotorAngle ?? 0,
    dt: request.dt ?? 0,
  });
}

export function resolveShredderSweep({
  x,
  z,
  yaw,
  rotorAngle = 0,
  dt = 0,
}: {
  x: number;
  z: number;
  yaw: number;
  rotorAngle?: number;
  dt?: number;
}): PlanarMotionResult {
  const bladeResult = resolveShredderBladeContact(x, z, yaw, rotorAngle, dt);
  x = bladeResult.x;
  z = bladeResult.z;
  const dx = SHREDDER_CENTER[0] - x;
  const dz = SHREDDER_CENTER[1] - z;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const localX = cos * dx + sin * dz;
  const localZ = -sin * dx + cos * dz;
  const closestX = clamp(localX, -CHASSIS_HALF_X, CHASSIS_HALF_X);
  const closestZ = clamp(localZ, -CHASSIS_HALF_Z, CHASSIS_HALF_Z);
  const sepX = localX - closestX;
  const sepZ = localZ - closestZ;
  const distSq = sepX * sepX + sepZ * sepZ;

  if (distSq >= SHREDDER_SWEEP_RADIUS * SHREDDER_SWEEP_RADIUS) {
    return bladeResult.blockedBy === null
      ? { x, z, blockedBy: null, penetration: 0, impactSpeedMps: 0 }
      : { ...bladeResult, x, z };
  }

  if (distSq > 1e-10) {
    const dist = Math.sqrt(distSq);
    const result = pushRobotFromLocalNormal(
      x,
      z,
      yaw,
      sepX / dist,
      sepZ / dist,
      SHREDDER_SWEEP_RADIUS - dist,
    );
    return mergeShredderResults(bladeResult, result);
  }

  const pushX = CHASSIS_HALF_X + SHREDDER_SWEEP_RADIUS - Math.abs(localX);
  const pushZ = CHASSIS_HALF_Z + SHREDDER_SWEEP_RADIUS - Math.abs(localZ);
  if (pushX <= pushZ) {
    return mergeShredderResults(
      bladeResult,
      pushRobotFromLocalNormal(x, z, yaw, localX >= 0 ? 1 : -1, 0, pushX),
    );
  }
  return mergeShredderResults(
    bladeResult,
    pushRobotFromLocalNormal(x, z, yaw, 0, localZ >= 0 ? 1 : -1, pushZ),
  );
}

function resolveShredderBladeContact(
  x: number,
  z: number,
  yaw: number,
  rotorAngle: number,
  dt: number,
): PlanarMotionResult {
  const result: PlanarMotionResult = { x, z, blockedBy: null, penetration: 0, impactSpeedMps: 0 };
  for (const angle of [rotorAngle, rotorAngle + Math.PI / 2]) {
    const contact = intersectObb(
      makeObb(result.x, result.z, yaw, CHASSIS_HALF_X, CHASSIS_HALF_Z),
      makeObb(
        SHREDDER_CENTER[0],
        SHREDDER_CENTER[1],
        angle,
        SHREDDER_BLADE_HALF[0] + SHREDDER_CONTACT_MARGIN,
        SHREDDER_BLADE_HALF[2] + SHREDDER_CONTACT_MARGIN,
      ),
    );
    if (!contact) continue;
    result.x += contact.normalX * contact.penetration;
    result.z += contact.normalZ * contact.penetration;
    const push = bladeContactPush(result.x, result.z, contact.normalX, contact.normalZ, dt);
    result.x += push.x;
    result.z += push.z;
    result.blockedBy = 'shredder';
    result.penetration = Math.max(result.penetration, contact.penetration);
    result.impactSpeedMps = Math.max(result.impactSpeedMps, push.speedMps);
  }
  return result;
}

interface Obb2 {
  cx: number;
  cz: number;
  axisX: Vec2;
  axisZ: Vec2;
  halfX: number;
  halfZ: number;
}

interface Vec2 {
  x: number;
  z: number;
}

function makeObb(cx: number, cz: number, yaw: number, halfX: number, halfZ: number): Obb2 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    cx,
    cz,
    axisX: { x: cos, z: sin },
    axisZ: { x: -sin, z: cos },
    halfX,
    halfZ,
  };
}

function intersectObb(
  a: Obb2,
  b: Obb2,
): { normalX: number; normalZ: number; penetration: number } | null {
  const delta = { x: a.cx - b.cx, z: a.cz - b.cz };
  let bestAxis = a.axisX;
  let bestOverlap = Number.POSITIVE_INFINITY;
  for (const axis of [a.axisX, a.axisZ, b.axisX, b.axisZ]) {
    const distance = Math.abs(dot(delta, axis));
    const overlap = projectRadius(a, axis) + projectRadius(b, axis) - distance;
    if (overlap <= 0) return null;
    if (overlap < bestOverlap) {
      bestOverlap = overlap;
      bestAxis = axis;
    }
  }
  const sign = dot(delta, bestAxis) >= 0 ? 1 : -1;
  return { normalX: bestAxis.x * sign, normalZ: bestAxis.z * sign, penetration: bestOverlap };
}

function projectRadius(box: Obb2, axis: Vec2): number {
  return Math.abs(dot(box.axisX, axis)) * box.halfX + Math.abs(dot(box.axisZ, axis)) * box.halfZ;
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

function bladeContactPush(
  x: number,
  z: number,
  normalX: number,
  normalZ: number,
  dt: number,
): Vec2 & { speedMps: number } {
  if (dt <= 0) return { x: 0, z: 0, speedMps: 0 };
  const dx = x - SHREDDER_CENTER[0];
  const dz = z - SHREDDER_CENTER[1];
  const radius = Math.hypot(dx, dz);
  if (radius <= 1e-6) return { x: 0, z: 0, speedMps: 0 };
  const bladeVelocityX = SHREDDER_ROTATION_SPEED * dz;
  const bladeVelocityZ = -SHREDDER_ROTATION_SPEED * dx;
  const pushSpeed = Math.max(0, bladeVelocityX * normalX + bladeVelocityZ * normalZ);
  const distance = Math.min(SHREDDER_BLADE_PUSH_CAP_M, pushSpeed * dt * SHREDDER_BLADE_PUSH_SCALE);
  return {
    x: normalX * distance,
    z: normalZ * distance,
    speedMps: pushSpeed,
  };
}

function mergeShredderResults(
  first: PlanarMotionResult,
  second: PlanarMotionResult,
): PlanarMotionResult {
  return {
    x: second.x,
    z: second.z,
    blockedBy: first.blockedBy ?? second.blockedBy,
    penetration: Math.max(first.penetration, second.penetration),
    impactSpeedMps: Math.max(first.impactSpeedMps, second.impactSpeedMps),
  };
}

function pushRobotFromLocalNormal(
  x: number,
  z: number,
  yaw: number,
  normalX: number,
  normalZ: number,
  penetration: number,
): PlanarMotionResult {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const worldNormalX = cos * normalX - sin * normalZ;
  const worldNormalZ = sin * normalX + cos * normalZ;
  return {
    x: x - worldNormalX * penetration,
    z: z - worldNormalZ * penetration,
    blockedBy: 'shredder',
    penetration,
    impactSpeedMps: 0,
  };
}

export function shredderCenterDistance(x: number, z: number): number {
  return Math.hypot(x - SHREDDER_CENTER[0], z - SHREDDER_CENTER[1]);
}

export function robotDamageFootprintRadius(): number {
  return ROBOT_DAMAGE_FOOTPRINT_RADIUS;
}

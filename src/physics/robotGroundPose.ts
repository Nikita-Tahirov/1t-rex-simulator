import { Quaternion, Vector3 } from 'three';
import { terrainHeightAt } from './arena/terrainHeight.ts';
import { ROBOT } from './constants.ts';
import { FL, FR, RL, RR, WHEEL_DEFS, type WheelDef } from './robotDefs.ts';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RobotGroundPose {
  chassisY: number;
  rotation: QuatLike;
  xAxis: Vec3Like;
  yAxis: Vec3Like;
  zAxis: Vec3Like;
  roll: number;
  pitch: number;
  yaw: number;
}

/**
 * Сужение `WheelDef[]` до readonly tuple фиксированной длины 4. Двойной `as unknown as`
 * нужен потому, что {@link WHEEL_DEFS} объявлен как изменяемый `WheelDef[]`
 * (требование совместимости с тестами `wheelRolling.test.ts`), но здесь нужна
 * детерминированная индексация через {@link FL}/{@link FR}/{@link RL}/{@link RR}.
 * Инвариант длины = 4 обеспечивается определением {@link WHEEL_DEFS} в
 * `robotDefs.ts` и проверяется `robotGroundPose.test.ts`. Runtime-проверки нет —
 * это узкое место hot path (`useFrame`).
 */
const FOUR_WHEELS = WHEEL_DEFS as unknown as readonly [WheelDef, WheelDef, WheelDef, WheelDef];
const FRONT_X = (FOUR_WHEELS[FL].anchor[0] + FOUR_WHEELS[FR].anchor[0]) / 2;
const REAR_X = (FOUR_WHEELS[RL].anchor[0] + FOUR_WHEELS[RR].anchor[0]) / 2;
const LEFT_Z = (FOUR_WHEELS[FL].anchor[2] + FOUR_WHEELS[RL].anchor[2]) / 2;
const RIGHT_Z = (FOUR_WHEELS[FR].anchor[2] + FOUR_WHEELS[RR].anchor[2]) / 2;
const WHEELBASE = FRONT_X - REAR_X;
const TRACK_WIDTH = RIGHT_Z - LEFT_Z;
const WHEEL_GROUND_CLEARANCE =
  ROBOT.chassisStartHeight + FOUR_WHEELS[FL].anchor[1] - ROBOT.wheelRadius;

// Scratch quaternions/vectors. Module-scope, переиспользуются между вызовами —
// computeRobotGroundPose никогда не дёргается из нескольких потоков (single-threaded JS).
const quat = new Quaternion();
const yawQuat = new Quaternion();
const tiltQuat = new Quaternion();
const rollQuat = new Quaternion();
const xAxis = new Vector3();
const yAxis = new Vector3();
const zAxis = new Vector3();
const wheelCenterY = [0, 0, 0, 0];
const LOCAL_X_AXIS = new Vector3(1, 0, 0);
const LOCAL_Y_AXIS = new Vector3(0, 1, 0);
const LOCAL_Z_AXIS = new Vector3(0, 0, 1);
// Yaw-конвенция симулятора: forward=(cos(yaw), 0, sin(yaw)). В three.js это
// поворот вокруг отрицательной оси Y (см. `Robot.tsx` где currentYaw =
// atan2(forwardZ, forwardX) → положительный yaw поворачивает X к +Z).
const YAW_AXIS = new Vector3(0, -1, 0);

export function createRobotGroundPose(): RobotGroundPose {
  return {
    chassisY: ROBOT.chassisStartHeight,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    xAxis: { x: 1, y: 0, z: 0 },
    yAxis: { x: 0, y: 1, z: 0 },
    zAxis: { x: 0, y: 0, z: 1 },
    roll: 0,
    pitch: 0,
    yaw: 0,
  };
}

/**
 * Pose-driver: высота шасси и его ориентация на основе terrain под 4 колёсами.
 *
 * **Корневой инвариант 2026-05**: output yaw СТРОГО равен input yaw. Раньше
 * rotation собирался через Gram-Schmidt из normalWorld и desiredForward, и при
 * любом lateralSlope ≠ 0 (асимметричный заход на пандус, неровный мост) в
 * выходной rotation вносился drift по yaw. Этот drift попадал в
 * `setNextKinematicRotation`, на следующем кадре `chassis.rotation()` его
 * возвращал, `currentYaw` сдвигался дальше — positive feedback loop разворачивал
 * робота поперёк моста.
 *
 * Сейчас rotation = `R_yaw_world ∘ R_tilt_local` — yaw как чистое вращение
 * вокруг мировой −Y, наклон по terrain накладывается в локальной системе
 * (`R_pitch_z ∘ R_roll_x`). yaw input → yaw output без drift.
 */
export function computeRobotGroundPose(
  centerX: number,
  centerZ: number,
  yaw: number,
  out: RobotGroundPose = createRobotGroundPose(),
): RobotGroundPose {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);

  for (const [i, wheel] of FOUR_WHEELS.entries()) {
    const [localX, , localZ] = wheel.anchor;
    const worldX = centerX + cosYaw * localX - sinYaw * localZ;
    const worldZ = centerZ + sinYaw * localX + cosYaw * localZ;
    wheelCenterY[i] =
      terrainHeightAt(worldX, worldZ, out.chassisY) + ROBOT.wheelRadius + WHEEL_GROUND_CLEARANCE;
  }

  const frontY = ((wheelCenterY[FL] ?? 0) + (wheelCenterY[FR] ?? 0)) / 2;
  const rearY = ((wheelCenterY[RL] ?? 0) + (wheelCenterY[RR] ?? 0)) / 2;
  const leftY = ((wheelCenterY[FL] ?? 0) + (wheelCenterY[RL] ?? 0)) / 2;
  const rightY = ((wheelCenterY[FR] ?? 0) + (wheelCenterY[RR] ?? 0)) / 2;
  const forwardSlope = (frontY - rearY) / WHEELBASE;
  const lateralSlope = (rightY - leftY) / TRACK_WIDTH;
  const pitch = Math.atan(forwardSlope);
  // roll: положительный, когда левое колесо ВЫШЕ правого. Это согласовано
  // с тестом `pitches the robot up on the west bridge ramp` (там lateralSlope=0
  // → roll=0). Знак подобран так, чтобы flat-floor тест давал roll=0.
  const roll = -Math.atan(lateralSlope);

  yawQuat.setFromAxisAngle(YAW_AXIS, yaw);
  rollQuat.setFromAxisAngle(LOCAL_X_AXIS, roll);
  tiltQuat.setFromAxisAngle(LOCAL_Z_AXIS, pitch).multiply(rollQuat);
  quat.copy(yawQuat).multiply(tiltQuat).normalize();

  xAxis.copy(LOCAL_X_AXIS).applyQuaternion(quat);
  yAxis.copy(LOCAL_Y_AXIS).applyQuaternion(quat);
  zAxis.copy(LOCAL_Z_AXIS).applyQuaternion(quat);

  for (const [i, wheel] of FOUR_WHEELS.entries()) {
    const [localX, localY, localZ] = wheel.anchor;
    const worldX = centerX + xAxis.x * localX + yAxis.x * localY + zAxis.x * localZ;
    const worldZ = centerZ + xAxis.z * localX + yAxis.z * localY + zAxis.z * localZ;
    wheelCenterY[i] =
      terrainHeightAt(worldX, worldZ, out.chassisY) + ROBOT.wheelRadius + WHEEL_GROUND_CLEARANCE;
  }

  let chassisY = 0;
  for (const [i, wheel] of FOUR_WHEELS.entries()) {
    const [localX, localY, localZ] = wheel.anchor;
    const rotatedAnchorY = xAxis.y * localX + yAxis.y * localY + zAxis.y * localZ;
    chassisY += (wheelCenterY[i] ?? 0) - rotatedAnchorY;
  }
  out.chassisY = chassisY / FOUR_WHEELS.length;

  out.rotation.x = quat.x;
  out.rotation.y = quat.y;
  out.rotation.z = quat.z;
  out.rotation.w = quat.w;
  setVec(out.xAxis, xAxis);
  setVec(out.yAxis, yAxis);
  setVec(out.zAxis, zAxis);
  out.pitch = pitch;
  out.roll = roll;
  out.yaw = yaw;

  return out;
}

export function localPointToWorld(
  pose: Pick<RobotGroundPose, 'xAxis' | 'yAxis' | 'zAxis'>,
  center: Vec3Like,
  local: readonly [number, number, number],
  out: Vec3Like = { x: 0, y: 0, z: 0 },
): Vec3Like {
  const [localX, localY, localZ] = local;
  out.x = center.x + pose.xAxis.x * localX + pose.yAxis.x * localY + pose.zAxis.x * localZ;
  out.y = center.y + pose.xAxis.y * localX + pose.yAxis.y * localY + pose.zAxis.y * localZ;
  out.z = center.z + pose.xAxis.z * localX + pose.yAxis.z * localY + pose.zAxis.z * localZ;
  return out;
}

function setVec(out: Vec3Like, value: Vector3): void {
  out.x = value.x;
  out.y = value.y;
  out.z = value.z;
}

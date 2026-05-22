import { MotorModel as JointMotorModel } from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { type RapierCollider, type RapierRigidBody, useRevoluteJoint } from '@react-three/rapier';
import { useEffect, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { clamp } from '@/lib/math.ts';
import { resetRobotIntegrity } from '@/store/robotIntegrity.ts';
import { useScenarioStore } from '@/store/scenario-store.ts';
import { useSimStore } from '@/store/sim-store.ts';
import { telemetry } from '@/store/telemetry.ts';
import { getShredderRotorAngle } from './arena/shredderState.ts';
import { ROBOT } from './constants.ts';
import { bodyToWheelsInto, tankCommandToBodyInto } from './kinematics.ts';
import { RobotBody } from './RobotBody.tsx';
import { RobotWheels } from './RobotWheels.tsx';
import { makeRobotBodyPidStep, RobotBodyPid } from './robotBodyPid.ts';
import { FL, FR, RL, RR, WHEEL_DEFS } from './robotDefs.ts';
import { type FrameScratch, makeFrameScratch } from './robotFrameScratch.ts';
import { computeRobotGroundPose, createRobotGroundPose } from './robotGroundPose.ts';
import { constrainRobotPlanarMotion } from './robotMotionConstraints.ts';
import { syncWheelBodiesToGroundPose } from './robotPoseSync.ts';
import {
  publishRobotPowerTelemetry,
  RobotPowerModel,
  resetRobotPowerTelemetry,
} from './robotPower.ts';
import { resetChassis, resetRobotPose } from './robotReset.ts';
import { Spinner } from './Spinner.tsx';
import { robotChassisRef } from './sharedRefs.ts';
import { useKeyboard } from './useKeyboard.ts';
import { useKinematicObstacleController } from './useKinematicObstacleController.ts';
import { useRobotDamageModel } from './useRobotDamageModel.ts';
import {
  advanceRollingWheelAngles,
  applyRollingWheelPose,
  rollingWheelSpeedsFromBodyVelocityInto,
  wheelSpeedsTupleInto,
} from './wheelRolling.ts';

const ROBOT_GEOMETRY = {
  wheelbase: ROBOT.wheelbase,
  trackWidth: ROBOT.trackWidth,
  wheelRadius: ROBOT.wheelRadius,
} as const;

export function Robot() {
  const chassisRef = useRef<RapierRigidBody>(null!);
  const chassisColliderRef = useRef<RapierCollider>(null!);
  const wheelFL = useRef<RapierRigidBody>(null!);
  const wheelFR = useRef<RapierRigidBody>(null!);
  const wheelRL = useRef<RapierRigidBody>(null!);
  const wheelRR = useRef<RapierRigidBody>(null!);
  const wheelRefs = [wheelFL, wheelFR, wheelRL, wheelRR] as const;
  const keys = useKeyboard();
  const showRealModel = useSimStore((s) => s.showRealModel);
  const damageModel = useRobotDamageModel();
  const kinematicObstacles = useKinematicObstacleController();
  const powerModel = useRef(new RobotPowerModel());
  const bodyPid = useRef(new RobotBodyPid());
  const bodyPidOut = useRef(makeRobotBodyPidStep());
  const tmpQ = useRef(new Quaternion());
  const tmpWheelRollQ = useRef(new Quaternion());
  const tmpForward = useRef(new Vector3());
  const groundPose = useRef(createRobotGroundPose());
  // Scratch для hot path useFrame: ноль аллокаций на тик.
  const scratch = useRef<FrameScratch>(makeFrameScratch());
  const chassisCenter = useRef<{ x: number; y: number; z: number }>({
    x: 0,
    y: ROBOT.chassisStartHeight,
    z: 0,
  });
  const wheelWorld = useRef({ x: 0, y: 0, z: 0 });
  const wheelRollAngles = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const lastRobotResetId = useRef(0);
  const forwardVelocityRef = useRef(0);
  const angularVelocityRef = useRef(0);

  const jointFL = useRevoluteJoint(chassisRef, wheelFL, [
    WHEEL_DEFS[FL]!.anchor,
    [0, 0, 0],
    [0, 0, 1],
  ]);
  const jointFR = useRevoluteJoint(chassisRef, wheelFR, [
    WHEEL_DEFS[FR]!.anchor,
    [0, 0, 0],
    [0, 0, 1],
  ]);
  const jointRL = useRevoluteJoint(chassisRef, wheelRL, [
    WHEEL_DEFS[RL]!.anchor,
    [0, 0, 0],
    [0, 0, 1],
  ]);
  const jointRR = useRevoluteJoint(chassisRef, wheelRR, [
    WHEEL_DEFS[RR]!.anchor,
    [0, 0, 0],
    [0, 0, 1],
  ]);
  useEffect(() => {
    for (const j of [jointFL, jointFR, jointRL, jointRR]) {
      j.current?.configureMotorModel(JointMotorModel.AccelerationBased);
    }
    robotChassisRef.current = chassisRef.current;
    return () => {
      robotChassisRef.current = null;
    };
  }, [jointFL, jointFR, jointRL, jointRR]);

  useFrame((_, dt) => {
    const chassis = chassisRef.current;
    if (!chassis) return;

    const resetMotionState = () => {
      forwardVelocityRef.current = 0;
      angularVelocityRef.current = 0;
      wheelRollAngles.current.fill(0);
      powerModel.current.reset();
      bodyPid.current.reset();
      resetRobotPowerTelemetry();
      resetRobotIntegrity();
    };
    const resetRequest = useScenarioStore.getState().robotResetRequest;
    if (resetRequest && resetRequest.id !== lastRobotResetId.current) {
      lastRobotResetId.current = resetRequest.id;
      resetRobotPose(chassis, wheelRefs, resetRequest.pose);
      resetMotionState();
    }
    const k = keys.current;
    if (k.reset) {
      resetChassis(chassis, { x: 0, z: 0, yaw: 0 });
      resetMotionState();
    }

    const scenarioStore = useScenarioStore.getState();
    const pilot = scenarioStore.pilotInput;
    const usePilotInput = scenarioStore.commandSource === 'scenario' && pilot.active;
    let throttle: number;
    let turn: number;
    let brakeFactor: number;
    if (usePilotInput) {
      throttle = clamp(pilot.throttle, -1, 1);
      turn = clamp(pilot.turn, -1, 1);
      brakeFactor = clamp(pilot.brake, 0, 1);
    } else {
      throttle = (k.forward ? 1 : 0) + (k.backward ? -1 : 0);
      turn = (k.right ? 1 : 0) + (k.left ? -1 : 0);
      brakeFactor = k.brake ? 0 : 1;
    }

    const s = scratch.current;
    const target = s.target;
    tankCommandToBodyInto(target, throttle, turn, ROBOT.maxLinearSpeed, ROBOT.maxAngularSpeed);
    const powerScale = powerModel.current.brownoutScale();
    target.linear *= damageModel.driveScale * powerScale * brakeFactor;
    target.angular *= damageModel.driveScale * powerScale * brakeFactor;
    bodyToWheelsInto(s.wheels, target, ROBOT_GEOMETRY);
    wheelSpeedsTupleInto(s.targetOmega, s.wheels);
    const targetWheelOmega = s.targetOmega;

    if (target.linear !== 0 || target.angular !== 0) chassis.wakeUp();
    const rotNow = chassis.rotation();
    tmpQ.current.set(rotNow.x, rotNow.y, rotNow.z, rotNow.w);
    tmpForward.current.set(1, 0, 0).applyQuaternion(tmpQ.current);
    tmpForward.current.y = 0;
    tmpForward.current.normalize();
    const forwardX = tmpForward.current.x;
    const forwardZ = tmpForward.current.z;
    bodyPid.current.setGains(useSimStore.getState().drivePid);
    const pidOut = bodyPid.current.step(
      target.linear,
      target.angular,
      forwardVelocityRef.current,
      angularVelocityRef.current,
      dt,
      bodyPidOut.current,
    );
    const newForward = pidOut.linear;
    const newAngular = pidOut.angular;
    let appliedAngular = newAngular;
    forwardVelocityRef.current = newForward;
    angularVelocityRef.current = newAngular;
    const planarPos = chassis.translation();
    const currentYaw = Math.atan2(forwardZ, forwardX);
    const nextYaw = currentYaw - newAngular * dt;
    const desiredMoveX = forwardX * newForward * dt;
    const desiredMoveZ = forwardZ * newForward * dt;
    const allowedMove = kinematicObstacles.clampMovement(
      chassisColliderRef.current,
      desiredMoveX,
      desiredMoveZ,
    );
    damageModel.handleKinematicObstacleImpact(allowedMove.impactRole, Math.abs(newForward));
    const constrained = constrainRobotPlanarMotion({
      currentX: planarPos.x,
      currentZ: planarPos.z,
      desiredX: planarPos.x + allowedMove.x,
      desiredZ: planarPos.z + allowedMove.z,
      yaw: nextYaw,
      rotorAngle: getShredderRotorAngle(),
      dt,
    });
    if (constrained.blockedBy === 'shredder') {
      damageModel.handleKinematicObstacleImpact(
        'shredder-rotor',
        Math.max(Math.abs(newForward), constrained.impactSpeedMps),
      );
    }
    const nextX = constrained.x;
    const nextZ = constrained.z;
    const actualDeltaX = nextX - planarPos.x;
    const actualDeltaZ = nextZ - planarPos.z;
    const actualPlanarSpeed = Math.hypot(actualDeltaX, actualDeltaZ) / dt;
    const actualForwardSpeed = (actualDeltaX * forwardX + actualDeltaZ * forwardZ) / dt;
    let pose3d = computeRobotGroundPose(nextX, nextZ, nextYaw, groundPose.current);
    const yawWasClamped =
      nextYaw !== currentYaw &&
      kinematicObstacles.isPoseBlocked(chassisColliderRef.current, {
        position: { x: nextX, y: pose3d.chassisY, z: nextZ },
        rotation: pose3d.rotation,
      });
    if (yawWasClamped) {
      appliedAngular = 0;
      angularVelocityRef.current = 0;
      pose3d = computeRobotGroundPose(nextX, nextZ, currentYaw, groundPose.current);
    }
    const movementWasClamped =
      constrained.blockedBy !== null || allowedMove.clamped || yawWasClamped;
    if (movementWasClamped) {
      forwardVelocityRef.current = actualForwardSpeed;
      // Мягкий anti-windup: гасим integral, сохраняя derivative (energy удара).
      bodyPid.current.resetIntegralOnClamp();
    }
    const bv = s.bodyVelocity;
    bv.linear = actualForwardSpeed;
    bv.angular = appliedAngular;
    rollingWheelSpeedsFromBodyVelocityInto(s.measuredOmega, bv);
    bv.linear = newForward;
    bv.angular = newAngular;
    rollingWheelSpeedsFromBodyVelocityInto(s.intendedOmega, bv);
    const measuredWheelOmega = s.measuredOmega;
    const intendedWheelOmega = s.intendedOmega;
    const motorWheelOmega = movementWasClamped ? intendedWheelOmega : measuredWheelOmega;
    chassis.setNextKinematicTranslation({ x: nextX, y: pose3d.chassisY, z: nextZ });
    chassis.setNextKinematicRotation(pose3d.rotation);
    chassisCenter.current.x = nextX;
    chassisCenter.current.y = pose3d.chassisY;
    chassisCenter.current.z = nextZ;
    syncWheelBodiesToGroundPose(wheelRefs, pose3d, chassisCenter.current, wheelWorld.current);
    advanceRollingWheelAngles(wheelRollAngles.current, measuredWheelOmega, dt);
    applyRollingWheelPose(
      wheelRefs,
      pose3d.rotation,
      wheelRollAngles.current,
      tmpQ.current,
      tmpWheelRollQ.current,
    );

    telemetry.positionX = nextX;
    telemetry.positionY = pose3d.chassisY;
    telemetry.positionZ = nextZ;
    telemetry.roll = pose3d.roll;
    telemetry.pitch = pose3d.pitch;
    telemetry.yaw = pose3d.yaw;
    telemetry.filteredRoll = pose3d.roll;
    telemetry.filteredPitch = pose3d.pitch;
    telemetry.filteredYaw = pose3d.yaw;
    telemetry.speed = actualPlanarSpeed;
    telemetry.yawRate = -appliedAngular;
    telemetry.wheelOmegaTarget[0] = targetWheelOmega[0];
    telemetry.wheelOmegaTarget[1] = targetWheelOmega[1];
    telemetry.wheelOmegaTarget[2] = targetWheelOmega[2];
    telemetry.wheelOmegaTarget[3] = targetWheelOmega[3];
    telemetry.wheelOmega[0] = measuredWheelOmega[0];
    telemetry.wheelOmega[1] = measuredWheelOmega[1];
    telemetry.wheelOmega[2] = measuredWheelOmega[2];
    telemetry.wheelOmega[3] = measuredWheelOmega[3];
    publishRobotPowerTelemetry(
      powerModel.current.step({
        targetWheelOmega,
        measuredWheelOmega: motorWheelOmega,
        spinnerTargetRpm: useSimStore.getState().spinnerTargetRpm,
        spinnerRpm: telemetry.spinnerRpm,
        dt,
      }),
    );
  });

  return (
    <group>
      <RobotBody
        chassisRef={chassisRef}
        chassisColliderRef={chassisColliderRef}
        damageModel={damageModel}
        showRealModel={showRealModel}
      />
      <RobotWheels wheelRefs={wheelRefs} showRealModel={showRealModel} />
      <Spinner chassisRef={chassisRef} />
    </group>
  );
}

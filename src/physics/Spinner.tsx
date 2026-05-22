import { MotorModel as JointMotorModel } from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import {
  CylinderCollider,
  type RapierRigidBody,
  RigidBody,
  useRevoluteJoint,
} from '@react-three/rapier';
import { type RefObject, Suspense, useEffect, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { useScenarioStore } from '@/store/scenario-store.ts';
import { useSimStore } from '@/store/sim-store.ts';
import { telemetry } from '@/store/telemetry.ts';
import { SPINNER_COLLISION_GROUPS } from './collisionGroups.ts';
import { ROBOT } from './constants.ts';
import { RobotSpinnerModel } from './RobotSpinnerModel.tsx';
import {
  computeRobotGroundPose,
  createRobotGroundPose,
  localPointToWorld,
} from './robotGroundPose.ts';
import { useKeyboard } from './useKeyboard.ts';

/**
 * Вертикальный ротор 1T-REX.
 *
 * Конструктивно — диск, установленный на горизонтальной оси (поперёк хода).
 * В реальности привод — два мощных мотора через ременную передачу.
 * Здесь моделируем RevoluteJoint с встроенным `configureMotorVelocity` от Rapier
 * (всегда сохраняет авторитет управления R/F). Жёсткость motor (factor) — это
 * **функция PID-ползунков** из инженерной панели:
 *
 *   factor = SPINNER_MOTOR_BASE_FACTOR · (kp + ki·0.5 + kd·0.2)
 *
 * Семантически kp — это сама пропорциональная составляющая контура скорости
 * (ESC реального ротора управляется именно так: P-gain на ω, не полная PID).
 * При дефолте `{kp:1, ki:0, kd:0}` factor=100 — точная воспроизводимость прежнего
 * поведения. Минимум factor=10 гарантирует, что F всегда тормозит, даже если
 * пользователь обнулил все ползунки.
 *
 * Управление: R — раскрутка вверх, F — торможение. Цель в об/мин хранится в Zustand.
 * Гироскопический момент учитывается Rapier автоматически (large angular momentum
 * + пересчитываемый CCD на колайдере).
 */

interface SpinnerProps {
  chassisRef: RefObject<RapierRigidBody | null>;
}

const SPINNER_LOCAL_OFFSET = [ROBOT.spinnerOffsetX, ROBOT.spinnerOffsetY, 0] as const;

const SPINNER_MOTOR = {
  /** Базовый factor joint motor — даёт прежнее «нормальное» поведение при kp=1. */
  baseFactor: 100,
  /** Минимальный factor — даже при всех нулевых ползунках мотор сохраняет
   *  авторитет, чтобы F всегда тормозил и R разгонял (видимо медленнее). */
  minFactor: 10,
  /** Веса PID-ползунков в линейной комбинации factor. kp доминирует. */
  kpWeight: 1.0,
  kiWeight: 0.5,
  kdWeight: 0.2,
} as const;

export function Spinner({ chassisRef }: SpinnerProps) {
  const diskRef = useRef<RapierRigidBody>(null!);
  const targetRpm = useSimStore((s) => s.spinnerTargetRpm);
  const setTargetRpm = useSimStore((s) => s.setSpinnerTargetRpm);
  const showRealModel = useSimStore((s) => s.showRealModel);
  const keys = useKeyboard();
  const lastRobotResetId = useRef(0);
  const resetGroundPose = useRef(createRobotGroundPose());
  const resetCenter = useRef<{ x: number; y: number; z: number }>({
    x: 0,
    y: ROBOT.chassisStartHeight,
    z: 0,
  });
  const resetDiskPosition = useRef({ x: 0, y: 0, z: 0 });
  const chassisQ = useRef(new Quaternion());
  const spinnerAxis = useRef(new Vector3());

  // Анкер на шасси: ротор впереди, на уровне проёмов в кронштейнах.
  const joint = useRevoluteJoint(chassisRef as RefObject<RapierRigidBody>, diskRef, [
    [ROBOT.spinnerOffsetX, ROBOT.spinnerOffsetY, 0],
    [0, 0, 0],
    [0, 0, 1],
  ]);

  useEffect(() => {
    joint.current?.configureMotorModel(JointMotorModel.AccelerationBased);
  }, [joint]);

  useFrame((_, dt) => {
    const disk = diskRef.current;
    const resetRequest = useScenarioStore.getState().robotResetRequest;
    if (disk && resetRequest && resetRequest.id !== lastRobotResetId.current) {
      lastRobotResetId.current = resetRequest.id;
      const { pose } = resetRequest;
      const groundPose = computeRobotGroundPose(pose.x, pose.z, pose.yaw, resetGroundPose.current);
      resetCenter.current.x = pose.x;
      resetCenter.current.y = groundPose.chassisY;
      resetCenter.current.z = pose.z;
      const diskPosition = localPointToWorld(
        groundPose,
        resetCenter.current,
        SPINNER_LOCAL_OFFSET,
        resetDiskPosition.current,
      );
      disk.setTranslation({ x: diskPosition.x, y: diskPosition.y, z: diskPosition.z }, true);
      disk.setLinvel({ x: 0, y: 0, z: 0 }, true);
      disk.setAngvel({ x: 0, y: 0, z: 0 }, true);
      disk.setRotation(groundPose.rotation, true);
      telemetry.spinnerRpm = 0;
    }

    const k = keys.current;
    let rpm = targetRpm;
    if (k.spinnerUp) rpm = Math.min(ROBOT.spinnerMaxRpm, rpm + 800 * dt);
    else if (k.spinnerDown) rpm = Math.max(0, rpm - 1500 * dt);
    if (rpm !== targetRpm) setTargetRpm(rpm);

    const targetOmega = (rpm * 2 * Math.PI) / 60;
    const gains = useSimStore.getState().spinnerPid;
    const factor = Math.max(
      SPINNER_MOTOR.minFactor,
      SPINNER_MOTOR.baseFactor *
        (gains.kp * SPINNER_MOTOR.kpWeight +
          gains.ki * SPINNER_MOTOR.kiWeight +
          gains.kd * SPINNER_MOTOR.kdWeight),
    );
    const j = joint.current;
    if (j) j.configureMotorVelocity(targetOmega, factor);

    // Реальные обороты диска: разница угловой скорости диска и шасси
    // по текущей локальной Z-оси шасси.
    const chassis = chassisRef.current;
    if (disk && chassis) {
      const wDisk = disk.angvel();
      const wChassis = chassis.angvel();
      const rot = chassis.rotation();
      chassisQ.current.set(rot.x, rot.y, rot.z, rot.w);
      spinnerAxis.current.set(0, 0, 1).applyQuaternion(chassisQ.current).normalize();
      const omegaZ =
        (wDisk.x - wChassis.x) * spinnerAxis.current.x +
        (wDisk.y - wChassis.y) * spinnerAxis.current.y +
        (wDisk.z - wChassis.z) * spinnerAxis.current.z;
      telemetry.spinnerRpm = (omegaZ * 60) / (2 * Math.PI);
      telemetry.spinnerTargetRpm = rpm;
    }
  });

  return (
    <RigidBody
      ref={diskRef}
      colliders={false}
      position={[ROBOT.spinnerOffsetX, ROBOT.chassisStartHeight + ROBOT.spinnerOffsetY, 0]}
      mass={ROBOT.spinnerMass}
      friction={0.4}
      restitution={0.1}
      linearDamping={0}
      angularDamping={0.001}
      userData={{ role: 'spinner' }}
      ccd
    >
      <CylinderCollider
        args={[ROBOT.spinnerThickness / 2, ROBOT.spinnerRadius]}
        rotation={[Math.PI / 2, 0, 0]}
        collisionGroups={SPINNER_COLLISION_GROUPS}
      />
      {showRealModel ? (
        <Suspense fallback={null}>
          <RobotSpinnerModel />
        </Suspense>
      ) : (
        // Инженерный плейсхолдер: тонкий цилиндр + 4 зуба на крестовине.
        <>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry
              args={[ROBOT.spinnerRadius, ROBOT.spinnerRadius, ROBOT.spinnerThickness, 32]}
            />
            <meshStandardMaterial color="#ff3ea5" metalness={0.85} roughness={0.25} />
          </mesh>
          {[0, 1, 2, 3].map((i) => {
            const angle = (i * Math.PI) / 2;
            return (
              <mesh
                key={`tooth-${i}`}
                castShadow
                position={[
                  Math.cos(angle) * (ROBOT.spinnerRadius + 0.04),
                  Math.sin(angle) * (ROBOT.spinnerRadius + 0.04),
                  0,
                ]}
                rotation={[0, 0, angle]}
              >
                <boxGeometry args={[0.12, 0.05, ROBOT.spinnerThickness * 1.2]} />
                <meshStandardMaterial color="#22d3ee" metalness={0.9} roughness={0.2} />
              </mesh>
            );
          })}
        </>
      )}
    </RigidBody>
  );
}

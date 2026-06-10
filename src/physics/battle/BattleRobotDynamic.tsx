import { useFrame } from '@react-three/fiber';
import {
  type ContactForcePayload,
  CuboidCollider,
  type RapierRigidBody,
  RigidBody,
} from '@react-three/rapier';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { applyRobotDamage, resetRobotIntegrity } from '@/store/robotIntegrity.ts';
import { telemetry } from '@/store/telemetry.ts';
import { PLAYER_COLORS } from '@/theme/tokens.ts';
import { BATTLE_LOCAL_CHASSIS_GROUPS, BATTLE_PROXY_GROUPS } from '../collisionGroups.ts';
import { ROBOT } from '../constants.ts';
import {
  computeImpactDamageDelta,
  isDamagingArenaRole,
  ROBOT_IMPACT_DAMAGE_COOLDOWN_MS,
} from '../robotDamage.ts';
import { useKeyboard } from '../useKeyboard.ts';
import { useRobotDamageModel } from '../useRobotDamageModel.ts';
import { BattleRobotVisual } from './BattleRobotVisual.tsx';
import { BattleRotor } from './BattleRotor.tsx';
import {
  addDealtDamage,
  decaySpinnerRpm,
  resetDealtDamage,
  stepSpinnerRpm,
} from './battleCombat.ts';
import {
  passesContactCooldown,
  ramDamageFromForce,
  wallImpactExceeds,
} from './battleContactDamage.ts';
import { computeDriveForces, type DriveParams } from './battleDrive.ts';
import { battlePoses, removeBattlePose, setBattlePose } from './battleRobotRegistry.ts';
import type { BattleRobotConfig, BattleRobotProps } from './battleRobotTypes.ts';
import { readBattleUserData } from './battleUserData.ts';
import { SPAWN_HEIGHT } from './spawnPoints.ts';

/**
 * ДИНАМИЧЕСКИЙ боевой робот (уровень `full`). Локальный — настоящее Rapier-тело
 * шасси (масса из ТТХ), ведомое ограниченной тягой/моментом (skid-steer, см.
 * `battleDrive`): инерция, наезды/заклинивание, опрокидывание выпадают из физики.
 * Ротор — отдельное физ-тело ([`BattleRotor`]). Урон — по РЕАЛЬНОЙ контактной силе
 * (`battleContactDamage`) в накопитель `dealt`. Удалённые — кинематические прокси:
 * солидные препятствия, в которые локальный упирается, ведомые сетевой позой.
 */

// Габариты коллайдера шасси (половинные), чуть ниже центра — низкий ЦМ для устойчивости.
const CHASSIS_HALF = [ROBOT.chassisLength / 2, 0.16, ROBOT.chassisWidth / 2] as const;
const CHASSIS_COLLIDER_Y = -0.04;
const CHASSIS_MASS = ROBOT.chassisMass;
const MAX_DT = 1 / 30;

const DRIVE_PARAMS: DriveParams = {
  mass: ROBOT.chassisMass + 4 * ROBOT.wheelMass,
  yawInertia: 15,
  maxSpeed: ROBOT.maxLinearSpeed,
  maxYawRate: ROBOT.maxAngularSpeed,
  driveForceMax: 1500,
  turnTorqueMax: 900,
  lateralGrip: 9,
  driveScale: 1,
};

/** Кватернион поворота тела так, чтобы локальный +X смотрел по «нашему» yaw. */
function yawQuat(yaw: number): [number, number, number, number] {
  // Визуальная конвенция: rotation.y = −yaw (см. robotGroundPose) → угол −yaw вокруг Y.
  const half = -yaw / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

export function LocalDynamicRobot({ config, active }: BattleRobotProps) {
  const chassisRef = useRef<RapierRigidBody>(null!);
  const keys = useKeyboard();
  const damage = useRobotDamageModel();
  const spinnerRpm = useRef(0);
  const lastRamAt = useRef(new Map<string, number>());
  const lastWallAt = useRef(-Infinity);
  const fwd = useRef(new Vector3());
  const right = useRef(new Vector3());
  const quat = useRef(new Quaternion());
  const { uid, spawn, colorIndex } = config;
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]!;

  const spawnQuatValue = useMemo(() => yawQuat(spawn.yaw), [spawn.yaw]);
  const rotorSpawn = useMemo(
    () => ({
      x: spawn.x + Math.cos(spawn.yaw) * ROBOT.spinnerOffsetX,
      y: SPAWN_HEIGHT + ROBOT.spinnerOffsetY,
      z: spawn.z + Math.sin(spawn.yaw) * ROBOT.spinnerOffsetX,
    }),
    [spawn.x, spawn.z, spawn.yaw],
  );

  useEffect(() => {
    spinnerRpm.current = 0;
    lastRamAt.current.clear();
    resetRobotIntegrity();
    resetDealtDamage();
    telemetry.positionX = spawn.x;
    telemetry.positionZ = spawn.z;
    telemetry.positionY = SPAWN_HEIGHT;
    telemetry.yaw = spawn.yaw;
    telemetry.speed = 0;
    telemetry.spinnerRpm = 0;
    setBattlePose(uid, spawn.x, spawn.z, spawn.yaw, 0, 0, true);
    return () => removeBattlePose(uid);
  }, [uid, spawn.x, spawn.z, spawn.yaw]);

  const getSpinnerRpm = useCallback(() => spinnerRpm.current, []);

  const onContactForce = useCallback((payload: ContactForcePayload) => {
    const ud = readBattleUserData(payload.other.rigidBodyObject?.userData);
    const now = performance.now();
    if (ud.role === 'battle-robot' && ud.uid) {
      const dmg = ramDamageFromForce(payload.maxForceMagnitude);
      if (dmg > 0 && passesContactCooldown(lastRamAt.current, ud.uid, now)) {
        addDealtDamage(ud.uid, dmg);
      }
      return;
    }
    if (isDamagingArenaRole(ud.role) && wallImpactExceeds(payload.maxForceMagnitude)) {
      if (now - lastWallAt.current < ROBOT_IMPACT_DAMAGE_COOLDOWN_MS) return;
      lastWallAt.current = now;
      const result = computeImpactDamageDelta({
        speedMps: Math.abs(telemetry.speed),
        contactForceN: payload.maxForceMagnitude,
      });
      if (result.damage > 0) {
        applyRobotDamage({ amount: result.damage, source: 'impact', nowMs: now });
      }
    }
  }, []);

  useFrame((_, dt) => {
    const chassis = chassisRef.current;
    if (!chassis) return;
    const dtc = Math.min(dt, MAX_DT);
    const alive = telemetry.robotHealth > 0;
    const k = keys.current;

    const rot = chassis.rotation();
    quat.current.set(rot.x, rot.y, rot.z, rot.w);
    fwd.current.set(1, 0, 0).applyQuaternion(quat.current);
    fwd.current.y = 0;
    fwd.current.normalize();
    right.current.set(fwd.current.z, 0, -fwd.current.x);
    const lin = chassis.linvel();
    const forwardSpeed = lin.x * fwd.current.x + lin.z * fwd.current.z;
    const lateralSpeed = lin.x * right.current.x + lin.z * right.current.z;
    const yawRate = -chassis.angvel().y; // yaw_our = −threeY

    if (active && alive) {
      spinnerRpm.current = stepSpinnerRpm(spinnerRpm.current, k.spinnerUp, k.spinnerDown, dtc);
      const throttle = (k.forward ? 1 : 0) - (k.backward ? 1 : 0);
      const turn = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      const out = computeDriveForces(
        { forwardSpeed, lateralSpeed, yawRate },
        { throttle, turn, brake: k.brake ? 1 : 0 },
        { ...DRIVE_PARAMS, driveScale: damage.driveScale },
      );
      chassis.applyImpulse(
        {
          x: (fwd.current.x * out.forwardForce + right.current.x * out.lateralForce) * dtc,
          y: 0,
          z: (fwd.current.z * out.forwardForce + right.current.z * out.lateralForce) * dtc,
        },
        true,
      );
      chassis.applyTorqueImpulse({ x: 0, y: -out.yawTorque * dtc, z: 0 }, true);
    } else {
      spinnerRpm.current = decaySpinnerRpm(spinnerRpm.current, dtc);
    }

    const pos = chassis.translation();
    const yaw = Math.atan2(fwd.current.z, fwd.current.x);
    telemetry.positionX = pos.x;
    telemetry.positionY = pos.y;
    telemetry.positionZ = pos.z;
    telemetry.yaw = yaw;
    telemetry.speed = forwardSpeed;
    telemetry.spinnerRpm = spinnerRpm.current;
    setBattlePose(uid, pos.x, pos.z, yaw, forwardSpeed, spinnerRpm.current, alive);
  });

  return (
    <>
      <RigidBody
        ref={chassisRef}
        colliders={false}
        type="dynamic"
        position={[spawn.x, SPAWN_HEIGHT, spawn.z]}
        quaternion={spawnQuatValue}
        linearDamping={0.2}
        angularDamping={0.25}
        userData={{ role: 'battle-robot', uid }}
        ccd
        onContactForce={onContactForce}
      >
        <CuboidCollider
          args={[CHASSIS_HALF[0], CHASSIS_HALF[1], CHASSIS_HALF[2]]}
          position={[0, CHASSIS_COLLIDER_Y, 0]}
          mass={CHASSIS_MASS}
          friction={0.25}
          restitution={0.05}
          collisionGroups={BATTLE_LOCAL_CHASSIS_GROUPS}
        />
        <BattleRobotVisual colorIndex={colorIndex} omitRotor damageVisual={damage.visualState} />
      </RigidBody>
      <BattleRotor
        chassisRef={chassisRef}
        worldSpawn={rotorSpawn}
        spawnQuat={spawnQuatValue}
        getRpm={getSpinnerRpm}
        spinnerColor={color.accent}
      />
    </>
  );
}

export function RemoteDynamicProxy({ config }: { config: BattleRobotConfig }) {
  const bodyRef = useRef<RapierRigidBody>(null!);
  const { uid, spawn, colorIndex } = config;
  const spawnQuatValue = useMemo(() => yawQuat(spawn.yaw), [spawn.yaw]);
  const getSpinnerRpm = useCallback(() => battlePoses.get(uid)?.spinnerRpm ?? 0, [uid]);

  useEffect(() => {
    setBattlePose(uid, spawn.x, spawn.z, spawn.yaw, 0, 0, true);
    return () => removeBattlePose(uid);
  }, [uid, spawn.x, spawn.z, spawn.yaw]);

  useFrame(() => {
    const body = bodyRef.current;
    if (!body) return;
    const pose = battlePoses.get(uid);
    if (!pose) return;
    const y = pose.alive ? SPAWN_HEIGHT : SPAWN_HEIGHT - 0.04;
    body.setNextKinematicTranslation({ x: pose.x, y, z: pose.z });
    const q = yawQuat(pose.yaw);
    body.setNextKinematicRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      type="kinematicPosition"
      position={[spawn.x, SPAWN_HEIGHT, spawn.z]}
      quaternion={spawnQuatValue}
      userData={{ role: 'battle-robot', uid }}
    >
      <CuboidCollider
        args={[CHASSIS_HALF[0], CHASSIS_HALF[1], CHASSIS_HALF[2]]}
        position={[0, CHASSIS_COLLIDER_Y, 0]}
        collisionGroups={BATTLE_PROXY_GROUPS}
      />
      <BattleRobotVisual colorIndex={colorIndex} getSpinnerRpm={getSpinnerRpm} />
    </RigidBody>
  );
}

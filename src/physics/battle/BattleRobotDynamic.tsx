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
import { BATTLE_LOCAL_CHASSIS_GROUPS } from '../collisionGroups.ts';
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
  CHASSIS_COLLIDER_Y,
  CHASSIS_HALF,
  CHASSIS_MASS,
  MAX_DT,
  yawQuat,
} from './battleBodyShared.ts';
import {
  addDealtDamage,
  type CombatPose,
  dealSpinnerProximityDamage,
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
import {
  type BattlePose,
  battlePoses,
  makeBattlePose,
  removeBattlePose,
  setBattlePose,
} from './battleRobotRegistry.ts';
import type { BattleRobotProps } from './battleRobotTypes.ts';
import { readBattleUserData } from './battleUserData.ts';
import { SPAWN_HEIGHT } from './spawnPoints.ts';

/**
 * ЛОКАЛЬНЫЙ динамический боевой робот (уровень `full`) — настоящее Rapier-тело
 * шасси (масса из ТТХ), ведомое ограниченной тягой/моментом (skid-steer, см.
 * `battleDrive`): инерция, наезды/заклинивание, опрокидывание выпадают из физики.
 * Ротор — отдельное физ-тело ([`BattleRotor`]). Урон сопернику: таран — по РЕАЛЬНОЙ
 * контактной силе (`onContactForce`), спиннер — по проксимити (его диск утоплен в
 * корпус), всё в накопитель `dealt`. Удалённые роботы — в [`BattleRemoteRobot`].
 */

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

// Лёгкий authority-bias по min(uid): при клинче робот с БО́ЛЬШИМ uid уступает
// (снижает тягу), чтобы оба экрана сходились на версии меньшего uid —
// детерминированный тай-брейк без доп. сети. Полный pair-authority-transfer не
// делаем: расхождения на сильных ударах приняты планом, а трафик RTDB ограничен.
const CLASH_YIELD_MS = 130;
const CLASH_YIELD_FACTOR = 0.35;

export function LocalDynamicRobot({ config, active }: BattleRobotProps) {
  const chassisRef = useRef<RapierRigidBody>(null!);
  const keys = useKeyboard();
  const damage = useRobotDamageModel();
  const spinnerRpm = useRef(0);
  const lastRamAt = useRef(new Map<string, number>());
  const lastSpinAt = useRef(new Map<string, number>());
  const lastWallAt = useRef(-Infinity);
  const yieldUntil = useRef(0);
  const otherPoses = useRef<BattlePose[]>([]);
  const otherUids = useRef<string[]>([]);
  const poseScratch = useRef<BattlePose>(makeBattlePose());
  const selfCombat = useRef<CombatPose>({ x: 0, z: 0, yaw: 0, speed: 0 });
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
    lastSpinAt.current.clear();
    resetRobotIntegrity();
    resetDealtDamage();
    telemetry.positionX = spawn.x;
    telemetry.positionZ = spawn.z;
    telemetry.positionY = SPAWN_HEIGHT;
    telemetry.yaw = spawn.yaw;
    telemetry.speed = 0;
    telemetry.spinnerRpm = 0;
    setBattlePose(uid, makeBattlePose(spawn.x, spawn.z, spawn.yaw, SPAWN_HEIGHT, true));
    return () => removeBattlePose(uid);
  }, [uid, spawn.x, spawn.z, spawn.yaw]);

  const getSpinnerRpm = useCallback(() => spinnerRpm.current, []);

  const onContactForce = useCallback(
    (payload: ContactForcePayload) => {
      const ud = readBattleUserData(payload.other.rigidBodyObject?.userData);
      const now = performance.now();
      if (ud.role === 'battle-robot' && ud.uid) {
        const dmg = ramDamageFromForce(payload.maxForceMagnitude);
        if (dmg > 0 && passesContactCooldown(lastRamAt.current, ud.uid, now)) {
          addDealtDamage(ud.uid, dmg);
        }
        // Authority-bias: уступаем сопернику с МЕНЬШИМ uid (он авторитет пары).
        if (ud.uid < uid) yieldUntil.current = now + CLASH_YIELD_MS;
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
    },
    [uid],
  );

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
      const yielding = performance.now() < yieldUntil.current;
      const driveScale = damage.driveScale * (yielding ? CLASH_YIELD_FACTOR : 1);
      const out = computeDriveForces(
        { forwardSpeed, lateralSpeed, yawRate },
        { throttle, turn, brake: k.brake ? 1 : 0 },
        { ...DRIVE_PARAMS, driveScale },
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

    // Спиннер бьёт соперника по проксимити (его коллайдер утоплен в корпус —
    // через реальный контакт достаёт редко). Таран — отдельно, через onContactForce.
    if (active && alive) {
      collectAliveOthers(uid, otherPoses.current, otherUids.current);
      const self = selfCombat.current;
      self.x = pos.x;
      self.z = pos.z;
      self.yaw = yaw;
      self.speed = forwardSpeed;
      dealSpinnerProximityDamage(
        self,
        otherPoses.current,
        otherUids.current,
        spinnerRpm.current,
        performance.now(),
        lastSpinAt.current,
      );
    }

    telemetry.positionX = pos.x;
    telemetry.positionY = pos.y;
    telemetry.positionZ = pos.z;
    telemetry.yaw = yaw;
    telemetry.speed = forwardSpeed;
    telemetry.spinnerRpm = spinnerRpm.current;

    // Полная поза тела в реестр (для публикации и удалённого следования соперников).
    const p = poseScratch.current;
    p.x = pos.x;
    p.y = pos.y;
    p.z = pos.z;
    p.yaw = yaw;
    p.qx = rot.x;
    p.qy = rot.y;
    p.qz = rot.z;
    p.qw = rot.w;
    p.speed = forwardSpeed;
    p.vx = lin.x;
    p.vz = lin.z;
    p.spinnerRpm = spinnerRpm.current;
    p.alive = alive;
    setBattlePose(uid, p);
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

/** Заполняет переиспользуемые массивы поз/uid живых соперников (без аллокаций). */
function collectAliveOthers(selfUid: string, poses: BattlePose[], uids: string[]): void {
  poses.length = 0;
  uids.length = 0;
  for (const [id, other] of battlePoses) {
    if (id !== selfUid && other.alive) {
      poses.push(other);
      uids.push(id);
    }
  }
}

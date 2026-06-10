import { useFrame } from '@react-three/fiber';
import {
  type ContactForcePayload,
  CylinderCollider,
  type RapierRigidBody,
  RigidBody,
} from '@react-three/rapier';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { BATTLE_PROXY_GROUPS } from '../collisionGroups.ts';
import { ROBOT } from '../constants.ts';
import { BattleChassisColliders } from './BattleChassisColliders.tsx';
import { BattleRobotVisual } from './BattleRobotVisual.tsx';
import { clampAbs, MAX_DT, yawQuat } from './battleBodyShared.ts';
import {
  battlePoses,
  makeBattlePose,
  removeBattlePose,
  setBattlePose,
} from './battleRobotRegistry.ts';
import type { BattleRobotConfig } from './battleRobotTypes.ts';
import { readBattleUserData } from './battleUserData.ts';
import { SPAWN_HEIGHT } from './spawnPoints.ts';

/**
 * Удалённый боевой робот — ДИНАМИЧЕСКОЕ тело, мягко притягиваемое пружиной к
 * присланной сетевой позе (Gaffer state-sync). Сила ограничена, поэтому таран
 * локального робота даёт ВИДИМУЮ отдачу/опрокидывание, после чего тело
 * возвращается к авторитетной позе соперника (расхождения допустимы по плану).
 * Рыскание следует за сетью; крен/тангаж свободны (можно опрокинуть), высокий
 * angularDamping не даёт кувыркаться. Урон сопернику на ЭТОМ экране не считается —
 * его наносит соперник на своём клиенте и шлёт через `dealt`.
 */

const FOLLOW_TAU = 0.09;
const FOLLOW_FORCE_MAX = 1100;
const FOLLOW_TORQUE_MAX = 380;
const MAX_FOLLOW_SPEED = 40;
const REMOTE_MASS = ROBOT.chassisMass + 4 * ROBOT.wheelMass;
const REMOTE_YAW_INERTIA = 15;

// Free-flight: после СИЛЬНОГО удара (таран/диск локального робота) пружина
// отпускается на короткое окно — отлёт читается глазом, затем тело плавно
// возвращается к сетевой позе. Скорости в окне ограничены: диск передаёт
// через трение тангенциальную скорость до ~130 м/с, без клампа прокси улетал
// бы за арену за кадр.
const FREE_FLIGHT_FORCE_N = 1600;
const FREE_FLIGHT_MS = 280;
const FREE_FLIGHT_FOLLOW_FACTOR = 0.12;
const FREE_FLIGHT_MAX_SPEED = 14;
const FREE_FLIGHT_MAX_SPIN = 25;

export function RemoteDynamicRobot({ config }: { config: BattleRobotConfig }) {
  const bodyRef = useRef<RapierRigidBody>(null!);
  const qCur = useRef(new Quaternion());
  const qTar = useRef(new Quaternion());
  const axis = useRef(new Vector3());
  const impulse = useRef({ x: 0, y: 0, z: 0 });
  const torque = useRef({ x: 0, y: 0, z: 0 });
  const velScratch = useRef({ x: 0, y: 0, z: 0 });
  const freeUntil = useRef(0);
  const { uid, spawn, colorIndex } = config;
  const spawnQuatValue = useMemo(() => yawQuat(spawn.yaw), [spawn.yaw]);
  const getSpinnerRpm = useCallback(() => battlePoses.get(uid)?.spinnerRpm ?? 0, [uid]);

  // Сильный контакт с ЛОКАЛЬНЫМ роботом (таран или его диск) → окно free-flight.
  const onContactForce = useCallback((payload: ContactForcePayload) => {
    const role = readBattleUserData(payload.other.rigidBodyObject?.userData).role;
    if (role !== 'battle-robot' && role !== 'battle-rotor') return;
    if (payload.maxForceMagnitude < FREE_FLIGHT_FORCE_N) return;
    freeUntil.current = performance.now() + FREE_FLIGHT_MS;
  }, []);

  useEffect(() => {
    setBattlePose(uid, makeBattlePose(spawn.x, spawn.z, spawn.yaw, SPAWN_HEIGHT, true));
    return () => removeBattlePose(uid);
  }, [uid, spawn.x, spawn.z, spawn.yaw]);

  useFrame((_, dt) => {
    const body = bodyRef.current;
    if (!body) return;
    const pose = battlePoses.get(uid);
    if (!pose) return;
    // Мёртвый соперник «обмякает»: пружину/момент следования не применяем — тело
    // под гравитацией оседает (паритет с локальным мёртвым динамическим роботом и
    // тонущим кинематическим призраком). Коллайдер остаётся, его ещё можно толкнуть.
    if (!pose.alive) return;
    const dtc = Math.min(dt, MAX_DT);
    const free = performance.now() < freeUntil.current;
    const followScale = free ? FREE_FLIGHT_FOLLOW_FACTOR : 1;

    // Пружина к сетевой позе по XYZ (ограниченная сила → таран соперника проходит,
    // высота — для подброса/опрокидывания). В окне free-flight почти отпущена.
    const pos = body.translation();
    const vel = body.linvel();
    const fx = followForce(pose.x - pos.x, vel.x);
    const fy = followForce(pose.y - pos.y, vel.y);
    const fz = followForce(pose.z - pos.z, vel.z);
    const imp = impulse.current;
    imp.x = fx * dtc * followScale;
    imp.y = fy * dtc * followScale;
    imp.z = fz * dtc * followScale;
    body.applyImpulse(imp, true);

    if (free) clampBodyVelocity(body, velScratch.current);

    // Полная ориентация — к сетевому кватerниону (синхронизирует наклон/опрокидывание):
    // относительный поворот qErr = qTar · qCur⁻¹ → ось-угол → целевая угловая скорость.
    const rot = body.rotation();
    qCur.current.set(rot.x, rot.y, rot.z, rot.w);
    qTar.current.set(pose.qx, pose.qy, pose.qz, pose.qw);
    qCur.current.invert();
    qTar.current.multiply(qCur.current); // qErr = qTar * qCur⁻¹
    let angle = 2 * Math.acos(Math.min(1, Math.max(-1, qTar.current.w)));
    if (angle > Math.PI) angle -= 2 * Math.PI; // кратчайший путь
    const s = Math.sqrt(Math.max(1e-9, 1 - qTar.current.w * qTar.current.w));
    axis.current.set(qTar.current.x / s, qTar.current.y / s, qTar.current.z / s);
    const av = body.angvel();
    const k = REMOTE_YAW_INERTIA / (FOLLOW_TAU * FOLLOW_TAU);
    const tx = clampAbs(
      axis.current.x * angle * k - (av.x * REMOTE_YAW_INERTIA) / FOLLOW_TAU,
      FOLLOW_TORQUE_MAX,
    );
    const ty = clampAbs(
      axis.current.y * angle * k - (av.y * REMOTE_YAW_INERTIA) / FOLLOW_TAU,
      FOLLOW_TORQUE_MAX,
    );
    const tz = clampAbs(
      axis.current.z * angle * k - (av.z * REMOTE_YAW_INERTIA) / FOLLOW_TAU,
      FOLLOW_TORQUE_MAX,
    );
    const tq = torque.current;
    tq.x = tx * dtc * followScale;
    tq.y = ty * dtc * followScale;
    tq.z = tz * dtc * followScale;
    body.applyTorqueImpulse(tq, true);
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      type="dynamic"
      position={[spawn.x, SPAWN_HEIGHT, spawn.z]}
      quaternion={spawnQuatValue}
      linearDamping={0.4}
      angularDamping={1.2}
      userData={{ role: 'battle-robot', uid }}
      onContactForce={onContactForce}
    >
      <BattleChassisColliders collisionGroups={BATTLE_PROXY_GROUPS} />
      {/* Диск ротора соперника как ГЕОМЕТРИЯ (вращение визуальное): без него на
          экране жертвы удар диском физически не существовал — здоровье таяло
          без малейшего толчка. Подброс жертве даёт hit-reaction (battleKnockback). */}
      <CylinderCollider
        args={[ROBOT.spinnerThickness / 2, ROBOT.spinnerRadius]}
        position={[ROBOT.spinnerOffsetX, ROBOT.spinnerOffsetY, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        mass={ROBOT.spinnerMass}
        friction={0.4}
        restitution={0.2}
        collisionGroups={BATTLE_PROXY_GROUPS}
      />
      <BattleRobotVisual colorIndex={colorIndex} getSpinnerRpm={getSpinnerRpm} />
    </RigidBody>
  );
}

/** Кламп линейной и угловой скорости тела в окне free-flight (без аллокаций). */
function clampBodyVelocity(
  body: RapierRigidBody,
  scratch: { x: number; y: number; z: number },
): void {
  const v = body.linvel();
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed > FREE_FLIGHT_MAX_SPEED) {
    const s = FREE_FLIGHT_MAX_SPEED / speed;
    scratch.x = v.x * s;
    scratch.y = v.y * s;
    scratch.z = v.z * s;
    body.setLinvel(scratch, true);
  }
  const av = body.angvel();
  const spin = Math.hypot(av.x, av.y, av.z);
  if (spin > FREE_FLIGHT_MAX_SPIN) {
    const s = FREE_FLIGHT_MAX_SPIN / spin;
    scratch.x = av.x * s;
    scratch.y = av.y * s;
    scratch.z = av.z * s;
    body.setAngvel(scratch, true);
  }
}

/** Сила пружины следования по одной оси: тянет к нулю ошибки позиции, ограничена. */
function followForce(posErr: number, vel: number): number {
  const targetV = Math.max(-MAX_FOLLOW_SPEED, Math.min(MAX_FOLLOW_SPEED, posErr / FOLLOW_TAU));
  return clampAbs(((targetV - vel) * REMOTE_MASS) / FOLLOW_TAU, FOLLOW_FORCE_MAX);
}

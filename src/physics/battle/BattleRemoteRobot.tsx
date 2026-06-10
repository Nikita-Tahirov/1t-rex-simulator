import { useFrame } from '@react-three/fiber';
import { CuboidCollider, type RapierRigidBody, RigidBody } from '@react-three/rapier';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { BATTLE_PROXY_GROUPS } from '../collisionGroups.ts';
import { ROBOT } from '../constants.ts';
import { BattleRobotVisual } from './BattleRobotVisual.tsx';
import {
  CHASSIS_COLLIDER_Y,
  CHASSIS_HALF,
  CHASSIS_MASS,
  clampAbs,
  MAX_DT,
  yawQuat,
} from './battleBodyShared.ts';
import {
  battlePoses,
  makeBattlePose,
  removeBattlePose,
  setBattlePose,
} from './battleRobotRegistry.ts';
import type { BattleRobotConfig } from './battleRobotTypes.ts';
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

export function RemoteDynamicRobot({ config }: { config: BattleRobotConfig }) {
  const bodyRef = useRef<RapierRigidBody>(null!);
  const qCur = useRef(new Quaternion());
  const qTar = useRef(new Quaternion());
  const axis = useRef(new Vector3());
  const { uid, spawn, colorIndex } = config;
  const spawnQuatValue = useMemo(() => yawQuat(spawn.yaw), [spawn.yaw]);
  const getSpinnerRpm = useCallback(() => battlePoses.get(uid)?.spinnerRpm ?? 0, [uid]);

  useEffect(() => {
    setBattlePose(uid, makeBattlePose(spawn.x, spawn.z, spawn.yaw, SPAWN_HEIGHT, true));
    return () => removeBattlePose(uid);
  }, [uid, spawn.x, spawn.z, spawn.yaw]);

  useFrame((_, dt) => {
    const body = bodyRef.current;
    if (!body) return;
    const pose = battlePoses.get(uid);
    if (!pose) return;
    const dtc = Math.min(dt, MAX_DT);

    // Пружина к сетевой позе по XYZ (ограниченная сила → таран соперника проходит,
    // высота — для подброса/опрокидывания).
    const pos = body.translation();
    const vel = body.linvel();
    const fx = followForce(pose.x - pos.x, vel.x);
    const fy = followForce(pose.y - pos.y, vel.y);
    const fz = followForce(pose.z - pos.z, vel.z);
    body.applyImpulse({ x: fx * dtc, y: fy * dtc, z: fz * dtc }, true);

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
    body.applyTorqueImpulse({ x: tx * dtc, y: ty * dtc, z: tz * dtc }, true);
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
    >
      <CuboidCollider
        args={[CHASSIS_HALF[0], CHASSIS_HALF[1], CHASSIS_HALF[2]]}
        position={[0, CHASSIS_COLLIDER_Y, 0]}
        mass={CHASSIS_MASS}
        friction={0.25}
        collisionGroups={BATTLE_PROXY_GROUPS}
      />
      <BattleRobotVisual colorIndex={colorIndex} getSpinnerRpm={getSpinnerRpm} />
    </RigidBody>
  );
}

/** Сила пружины следования по одной оси: тянет к нулю ошибки позиции, ограничена. */
function followForce(posErr: number, vel: number): number {
  const targetV = Math.max(-MAX_FOLLOW_SPEED, Math.min(MAX_FOLLOW_SPEED, posErr / FOLLOW_TAU));
  return clampAbs(((targetV - vel) * REMOTE_MASS) / FOLLOW_TAU, FOLLOW_FORCE_MAX);
}

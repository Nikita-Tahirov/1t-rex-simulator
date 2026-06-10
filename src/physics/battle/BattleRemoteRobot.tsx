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
import { battlePoses, removeBattlePose, setBattlePose } from './battleRobotRegistry.ts';
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
  const fwd = useRef(new Vector3());
  const quat = useRef(new Quaternion());
  const { uid, spawn, colorIndex } = config;
  const spawnQuatValue = useMemo(() => yawQuat(spawn.yaw), [spawn.yaw]);
  const getSpinnerRpm = useCallback(() => battlePoses.get(uid)?.spinnerRpm ?? 0, [uid]);

  useEffect(() => {
    setBattlePose(uid, spawn.x, spawn.z, spawn.yaw, 0, 0, true);
    return () => removeBattlePose(uid);
  }, [uid, spawn.x, spawn.z, spawn.yaw]);

  useFrame((_, dt) => {
    const body = bodyRef.current;
    if (!body) return;
    const pose = battlePoses.get(uid);
    if (!pose) return;
    const dtc = Math.min(dt, MAX_DT);

    const pos = body.translation();
    const vel = body.linvel();
    // Пружина к сетевой позе по XZ (ограниченная сила → толчок проходит).
    const targetVx = clampSpeed((pose.x - pos.x) / FOLLOW_TAU);
    const targetVz = clampSpeed((pose.z - pos.z) / FOLLOW_TAU);
    const fx = clampAbs(((targetVx - vel.x) * REMOTE_MASS) / FOLLOW_TAU, FOLLOW_FORCE_MAX);
    const fz = clampAbs(((targetVz - vel.z) * REMOTE_MASS) / FOLLOW_TAU, FOLLOW_FORCE_MAX);
    body.applyImpulse({ x: fx * dtc, y: 0, z: fz * dtc }, true);

    // Рыскание — к сетевому yaw.
    const rot = body.rotation();
    quat.current.set(rot.x, rot.y, rot.z, rot.w);
    fwd.current.set(1, 0, 0).applyQuaternion(quat.current);
    const yaw = Math.atan2(fwd.current.z, fwd.current.x);
    let errYaw = pose.yaw - yaw;
    while (errYaw > Math.PI) errYaw -= 2 * Math.PI;
    while (errYaw < -Math.PI) errYaw += 2 * Math.PI;
    const yawRate = -body.angvel().y;
    const torque = clampAbs(
      ((errYaw / FOLLOW_TAU - yawRate) * REMOTE_YAW_INERTIA) / FOLLOW_TAU,
      FOLLOW_TORQUE_MAX,
    );
    body.applyTorqueImpulse({ x: 0, y: -torque * dtc, z: 0 }, true);
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

function clampSpeed(v: number): number {
  return Math.max(-MAX_FOLLOW_SPEED, Math.min(MAX_FOLLOW_SPEED, v));
}

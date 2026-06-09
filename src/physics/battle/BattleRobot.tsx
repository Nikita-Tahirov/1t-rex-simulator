import { useFrame } from '@react-three/fiber';
import { type RefObject, useEffect, useRef } from 'react';
import type { Group } from 'three';
import { applyRobotDamage, resetRobotIntegrity } from '@/store/robotIntegrity.ts';
import { telemetry } from '@/store/telemetry.ts';
import { ROBOT } from '../constants.ts';
import { computeImpactDamageDelta, ROBOT_IMPACT_DAMAGE_COOLDOWN_MS } from '../robotDamage.ts';
import { useKeyboard } from '../useKeyboard.ts';
import { useRobotDamageModel } from '../useRobotDamageModel.ts';
import { BattleRobotVisual } from './BattleRobotVisual.tsx';
import {
  type ArcadePose,
  clampToArena,
  closingSpeed,
  separateFromObstacles,
  stepArcade,
} from './battleArcade.ts';
import {
  type BattlePose,
  battlePoses,
  removeBattlePose,
  setBattlePose,
} from './battleRobotRegistry.ts';
import { SPAWN_HEIGHT, type SpawnPose } from './spawnPoints.ts';

/**
 * Боевой робот сетевого режима — чисто визуальный (без Rapier RigidBody).
 *
 * Local: ведётся клавиатурой через аркадную кинематику (`battleArcade`), клампится
 * к стенам и расталкивается с соперниками вручную, получает урон по скорости
 * сближения через существующую модель `robotDamage`/`telemetry`. Пишет свою позу
 * в `telemetry` (камера и датчик прочности работают переиспользованием) и в
 * реестр поз. Remote: позу берёт из реестра (его наполняет хук интерполяции).
 */

export interface BattleRobotConfig {
  uid: string;
  colorIndex: number;
  isLocal: boolean;
  spawn: SpawnPose;
}

interface BattleRobotProps {
  config: BattleRobotConfig;
  arenaSize: number;
  /** Управление включено (обратный отсчёт завершён). */
  active: boolean;
}

const ROBOT_MIN_DISTANCE = 1.0;
const ACCEL_TAU = 0.18;
const WALL_INSET = 0.6;
const WALL_DAMAGE_MIN_SPEED = 1.5;
const ENEMY_DAMAGE_MIN_SPEED = 1.0;
const IMPACT_SPEED_BLEED = 0.35;
const DEAD_SINK_Y = 0.04;
const MAX_DT = 0.05;

export function BattleRobot(props: BattleRobotProps) {
  return props.config.isLocal ? (
    <LocalBattleRobot {...props} />
  ) : (
    <RemoteBattleRobot config={props.config} />
  );
}

function LocalBattleRobot({ config, arenaSize, active }: BattleRobotProps) {
  const groupRef = useRef<Group>(null);
  const keys = useKeyboard();
  const damage = useRobotDamageModel();
  const pose = useRef<ArcadePose>({
    x: config.spawn.x,
    z: config.spawn.z,
    yaw: config.spawn.yaw,
    speed: 0,
  });
  const lastImpact = useRef(-Infinity);
  const others = useRef<BattlePose[]>([]);
  const { x: spawnX, z: spawnZ, yaw: spawnYaw } = config.spawn;

  useEffect(() => {
    pose.current = { x: spawnX, z: spawnZ, yaw: spawnYaw, speed: 0 };
    resetRobotIntegrity();
    telemetry.positionX = spawnX;
    telemetry.positionZ = spawnZ;
    telemetry.positionY = SPAWN_HEIGHT;
    telemetry.yaw = spawnYaw;
    telemetry.speed = 0;
    setBattlePose(config.uid, spawnX, spawnZ, spawnYaw, 0, true);
    return () => removeBattlePose(config.uid);
  }, [config.uid, spawnX, spawnZ, spawnYaw]);

  useFrame((_, dt) => {
    const group = groupRef.current;
    if (!group) return;
    const dtc = Math.min(dt, MAX_DT);
    const alive = telemetry.robotHealth > 0;
    const p = pose.current;

    if (active && alive) {
      const k = keys.current;
      const throttle = (k.forward ? 1 : 0) - (k.backward ? 1 : 0);
      const turn = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      const stepped = stepArcade(
        p,
        { throttle, turn, brake: k.brake ? 1 : 0 },
        {
          maxSpeed: ROBOT.maxLinearSpeed,
          maxYawRate: ROBOT.maxAngularSpeed,
          accelTau: ACCEL_TAU,
          driveScale: damage.driveScale,
        },
        dtc,
      );

      const obstacles = others.current;
      obstacles.length = 0;
      for (const [id, other] of battlePoses) {
        if (id !== config.uid && other.alive) obstacles.push(other);
      }

      const wall = clampToArena(stepped.x, stepped.z, arenaSize / 2 - WALL_INSET);
      const sep = separateFromObstacles(wall.x, wall.z, obstacles, ROBOT_MIN_DISTANCE);
      p.x = sep.x;
      p.z = sep.z;
      p.yaw = stepped.yaw;
      p.speed = stepped.speed;

      const speedAbs = Math.abs(stepped.speed);
      if (wall.hit && speedAbs > WALL_DAMAGE_MIN_SPEED) applyImpactDamage(speedAbs, lastImpact);
      if (sep.hitIndex >= 0) {
        const closing = closingSpeed(p, obstacles[sep.hitIndex]!);
        if (closing > ENEMY_DAMAGE_MIN_SPEED) applyImpactDamage(closing, lastImpact);
      }
      if (wall.hit || sep.hitIndex >= 0) p.speed *= IMPACT_SPEED_BLEED;
    } else {
      p.speed = 0;
    }

    telemetry.positionX = p.x;
    telemetry.positionZ = p.z;
    telemetry.positionY = alive ? SPAWN_HEIGHT : SPAWN_HEIGHT - DEAD_SINK_Y;
    telemetry.yaw = p.yaw;
    telemetry.speed = p.speed;
    setBattlePose(config.uid, p.x, p.z, p.yaw, p.speed, alive);
    applyPoseToGroup(group, p.x, p.z, p.yaw, alive);
  });

  return (
    <BattleRobotVisual
      ref={groupRef}
      colorIndex={config.colorIndex}
      damageVisual={damage.visualState}
    />
  );
}

function RemoteBattleRobot({ config }: { config: BattleRobotConfig }) {
  const groupRef = useRef<Group>(null);
  const { uid, spawn } = config;

  useEffect(() => {
    setBattlePose(uid, spawn.x, spawn.z, spawn.yaw, 0, true);
    return () => removeBattlePose(uid);
  }, [uid, spawn.x, spawn.z, spawn.yaw]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const pose = battlePoses.get(uid);
    if (pose) applyPoseToGroup(group, pose.x, pose.z, pose.yaw, pose.alive);
  });

  return <BattleRobotVisual ref={groupRef} colorIndex={config.colorIndex} />;
}

function applyPoseToGroup(group: Group, x: number, z: number, yaw: number, alive: boolean): void {
  group.position.set(x, alive ? SPAWN_HEIGHT : SPAWN_HEIGHT - DEAD_SINK_Y, z);
  // Yaw-конвенция симулятора: поворот вокруг мировой −Y (см. robotGroundPose).
  group.rotation.set(0, -yaw, 0);
}

function applyImpactDamage(speedMps: number, lastImpactRef: RefObject<number>): void {
  const nowMs = performance.now();
  if (nowMs - lastImpactRef.current < ROBOT_IMPACT_DAMAGE_COOLDOWN_MS) return;
  const result = computeImpactDamageDelta({ speedMps });
  if (result.damage <= 0) return;
  lastImpactRef.current = nowMs;
  applyRobotDamage({
    amount: result.damage,
    source: 'impact',
    nowMs,
    energyJ: Math.max(result.kineticEnergyJ, result.impulseEnergyJ),
  });
}

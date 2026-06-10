import { useFrame } from '@react-three/fiber';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
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
  separateFromObstacles,
  stepArcade,
} from './battleArcade.ts';
import {
  type CombatPose,
  dealMeleeDamage,
  decaySpinnerRpm,
  resetDealtDamage,
  stepSpinnerRpm,
} from './battleCombat.ts';
import {
  type BattlePose,
  battlePoses,
  makeBattlePose,
  removeBattlePose,
  setBattlePose,
  yawToQuat,
} from './battleRobotRegistry.ts';
import type { BattleRobotConfig, BattleRobotProps } from './battleRobotTypes.ts';
import { SPAWN_HEIGHT } from './spawnPoints.ts';

/** Заполняет полную позу из 2D-кинематики (высота фикс, наклона нет). */
function fillKinematicPose(
  out: BattlePose,
  x: number,
  z: number,
  yaw: number,
  speed: number,
  spinnerRpm: number,
  alive: boolean,
): void {
  out.x = x;
  out.y = SPAWN_HEIGHT;
  out.z = z;
  out.yaw = yaw;
  yawToQuat(yaw, out);
  out.speed = speed;
  out.vx = Math.cos(yaw) * speed;
  out.vz = Math.sin(yaw) * speed;
  out.spinnerRpm = spinnerRpm;
  out.alive = alive;
}

/**
 * Лёгкий КИНЕМАТИЧЕСКИЙ боевой робот (fallback-уровень `lite` адаптивной деградации
 * и для слабых устройств). Поза считается аркадной кинематикой `battleArcade`, урон —
 * по сближению/фронту через `battleCombat` (атакующий копит `dealt`). Без Rapier-тел,
 * поэтому дёшев. Полноценная физика — в `BattleRobotDynamic`.
 */

const ROBOT_MIN_DISTANCE = 1.0;
const ACCEL_TAU = 0.18;
const WALL_INSET = 0.6;
const WALL_DAMAGE_MIN_SPEED = 1.5;
const IMPACT_SPEED_BLEED = 0.35;
const DEAD_SINK_Y = 0.04;
const MAX_DT = 0.05;

export function LocalKinematicRobot({ config, arenaSize, active }: BattleRobotProps) {
  const groupRef = useRef<Group>(null);
  const keys = useKeyboard();
  const damage = useRobotDamageModel();
  const pose = useRef<ArcadePose>({
    x: config.spawn.x,
    z: config.spawn.z,
    yaw: config.spawn.yaw,
    speed: 0,
  });
  const spinnerRpm = useRef(0);
  const lastWallImpact = useRef(-Infinity);
  const lastRamAt = useRef(new Map<string, number>());
  const lastSpinAt = useRef(new Map<string, number>());
  const otherPoses = useRef<BattlePose[]>([]);
  const otherUids = useRef<string[]>([]);
  const poseScratch = useRef<BattlePose>(makeBattlePose());
  const selfPose = useRef<CombatPose>({ x: 0, z: 0, yaw: 0, speed: 0 });
  const { x: spawnX, z: spawnZ, yaw: spawnYaw } = config.spawn;

  useEffect(() => {
    pose.current = { x: spawnX, z: spawnZ, yaw: spawnYaw, speed: 0 };
    spinnerRpm.current = 0;
    lastRamAt.current.clear();
    lastSpinAt.current.clear();
    resetRobotIntegrity();
    resetDealtDamage();
    telemetry.positionX = spawnX;
    telemetry.positionZ = spawnZ;
    telemetry.positionY = SPAWN_HEIGHT;
    telemetry.yaw = spawnYaw;
    telemetry.speed = 0;
    telemetry.spinnerRpm = 0;
    setBattlePose(config.uid, makeBattlePose(spawnX, spawnZ, spawnYaw, SPAWN_HEIGHT, true));
    return () => removeBattlePose(config.uid);
  }, [config.uid, spawnX, spawnZ, spawnYaw]);

  const getSpinnerRpm = useCallback(() => spinnerRpm.current, []);

  useFrame((_, dt) => {
    const group = groupRef.current;
    if (!group) return;
    const dtc = Math.min(dt, MAX_DT);
    const alive = telemetry.robotHealth > 0;
    const p = pose.current;
    const k = keys.current;

    if (active && alive) {
      const throttle = (k.forward ? 1 : 0) - (k.backward ? 1 : 0);
      const turn = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      spinnerRpm.current = stepSpinnerRpm(spinnerRpm.current, k.spinnerUp, k.spinnerDown, dtc);
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

      collectOthers(config.uid, otherPoses.current, otherUids.current);
      const wall = clampToArena(stepped.x, stepped.z, arenaSize / 2 - WALL_INSET);
      const sep = separateFromObstacles(wall.x, wall.z, otherPoses.current, ROBOT_MIN_DISTANCE);
      p.x = sep.x;
      p.z = sep.z;
      p.yaw = stepped.yaw;
      p.speed = stepped.speed;

      const speedAbs = Math.abs(stepped.speed);
      if (wall.hit && speedAbs > WALL_DAMAGE_MIN_SPEED) {
        applyWallDamage(speedAbs, lastWallImpact);
      }
      const self = selfPose.current;
      self.x = p.x;
      self.z = p.z;
      self.yaw = p.yaw;
      self.speed = p.speed;
      dealMeleeDamage(
        self,
        otherPoses.current,
        otherUids.current,
        spinnerRpm.current,
        performance.now(),
        lastRamAt.current,
        lastSpinAt.current,
      );
      if (wall.hit || sep.hitIndex >= 0) p.speed *= IMPACT_SPEED_BLEED;
    } else {
      p.speed = 0;
      spinnerRpm.current = decaySpinnerRpm(spinnerRpm.current, dtc);
    }

    telemetry.positionX = p.x;
    telemetry.positionZ = p.z;
    telemetry.positionY = alive ? SPAWN_HEIGHT : SPAWN_HEIGHT - DEAD_SINK_Y;
    telemetry.yaw = p.yaw;
    telemetry.speed = p.speed;
    telemetry.spinnerRpm = spinnerRpm.current;
    fillKinematicPose(poseScratch.current, p.x, p.z, p.yaw, p.speed, spinnerRpm.current, alive);
    setBattlePose(config.uid, poseScratch.current);
    applyPoseToGroup(group, p.x, p.z, p.yaw, alive);
  });

  return (
    <BattleRobotVisual
      ref={groupRef}
      colorIndex={config.colorIndex}
      getSpinnerRpm={getSpinnerRpm}
      damageVisual={damage.visualState}
    />
  );
}

export function RemoteKinematicRobot({ config }: { config: BattleRobotConfig }) {
  const groupRef = useRef<Group>(null);
  const { uid, spawn } = config;

  useEffect(() => {
    setBattlePose(uid, makeBattlePose(spawn.x, spawn.z, spawn.yaw, SPAWN_HEIGHT, true));
    return () => removeBattlePose(uid);
  }, [uid, spawn.x, spawn.z, spawn.yaw]);

  const getSpinnerRpm = useCallback(() => battlePoses.get(uid)?.spinnerRpm ?? 0, [uid]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const pose = battlePoses.get(uid);
    if (pose) applyPoseToGroup(group, pose.x, pose.z, pose.yaw, pose.alive);
  });

  return (
    <BattleRobotVisual
      ref={groupRef}
      colorIndex={config.colorIndex}
      getSpinnerRpm={getSpinnerRpm}
    />
  );
}

/** Заполняет переиспользуемые массивы поз/uid живых соперников (без аллокаций). */
function collectOthers(selfUid: string, poses: BattlePose[], uids: string[]): void {
  poses.length = 0;
  uids.length = 0;
  for (const [id, other] of battlePoses) {
    if (id !== selfUid && other.alive) {
      poses.push(other);
      uids.push(id);
    }
  }
}

function applyPoseToGroup(group: Group, x: number, z: number, yaw: number, alive: boolean): void {
  group.position.set(x, alive ? SPAWN_HEIGHT : SPAWN_HEIGHT - DEAD_SINK_Y, z);
  // Yaw-конвенция симулятора: поворот вокруг мировой −Y (см. robotGroundPose).
  group.rotation.set(0, -yaw, 0);
}

function applyWallDamage(speedMps: number, lastImpactRef: RefObject<number>): void {
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

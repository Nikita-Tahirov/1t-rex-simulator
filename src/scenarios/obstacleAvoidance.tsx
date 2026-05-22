import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { SceneMarkerRing } from '@/physics/SceneMarkers.tsx';
import { goToTarget } from './_pilotHelpers.ts';
import type { Scenario } from './manager.ts';

/**
 * Сценарий «Объезд препятствий».
 *
 * Четыре барьера стоят на прямой линии старта-финиша. Робот проходит трассу
 * слаломом: +Z, -Z, +Z, -Z и только потом выходит к финишу. Прямой проезд
 * физически ведёт к столкновениям и не считается валидным результатом.
 *
 * Метрика — пенальти-функция: время + 2 × кол-во столкновений +
 * интегральная ошибка относительно слаломной траектории.
 * Цель: робот в радиусе 0.5 м от точки (+3, 0).
 */

const FINISH_X = 3;
const FINISH_RADIUS = 0.5;
const COLLISION_PENALTY_SEC = 2;
const COLLISION_ARM_SEC = 0.35;
const TRACKING_ERROR_WEIGHT = 0.12;
const PASS_WAYPOINT_RADIUS_M = 0.72;
const LANE_WAYPOINT_RADIUS_M = 0.5;
const SWITCH_RADIUS_M = 0.48;
const WAYPOINT_PROGRESS_MARGIN_M = 0.08;
const SLALOM_CRUISE_THROTTLE = 0.62;
const FINAL_CRUISE_THROTTLE = 0.36;

// Барьеры стоят на центральной линии z = 0, а проходы заданы чередующимися сторонами.
// id-стабилен между рендерами — используется в качестве React key.
const OBSTACLES: Array<{ id: string; x: number; z: number }> = [
  { id: 'a', x: -1.65, z: 0 },
  { id: 'b', x: -0.15, z: 0 },
  { id: 'c', x: 1.15, z: 0 },
  { id: 'd', x: 2.25, z: 0 },
];

const BLOCK_HALF: [number, number, number] = [0.025, 0.5, 0.025];

const SLALOM_WAYPOINTS: Array<{ id: string; x: number; z: number }> = [
  { id: 'start', x: -3, z: 0 },
  { id: 'prep-a', x: -2.35, z: 0.95 },
  { id: 'pass-a', x: -1.65, z: 1.35 },
  { id: 'lane-ab-pos', x: -0.9, z: 1.35 },
  { id: 'switch-ab', x: -0.9, z: 0 },
  { id: 'lane-ab-neg', x: -0.9, z: -1.35 },
  { id: 'pass-b', x: -0.15, z: -1.35 },
  { id: 'lane-bc-neg', x: 0.5, z: -1.35 },
  { id: 'switch-bc', x: 0.5, z: 0 },
  { id: 'lane-bc-pos', x: 0.5, z: 1.35 },
  { id: 'pass-c', x: 1.15, z: 1.35 },
  { id: 'lane-cd-pos', x: 1.7, z: 1.35 },
  { id: 'switch-cd', x: 1.7, z: 0 },
  { id: 'lane-cd-neg', x: 1.7, z: -1.35 },
  { id: 'pass-d', x: 2.25, z: -1.35 },
  { id: 'finish', x: FINISH_X, z: 0 },
];

const SLALOM_SEGMENT_LENGTHS = SLALOM_WAYPOINTS.slice(1).map((point, index) => {
  const prev = SLALOM_WAYPOINTS[index]!;
  return Math.hypot(point.x - prev.x, point.z - prev.z);
});
const SLALOM_CUMULATIVE_LENGTHS = SLALOM_SEGMENT_LENGTHS.reduce<number[]>(
  (acc, length) => {
    acc.push((acc[acc.length - 1] ?? 0) + length);
    return acc;
  },
  [0],
);
const SLALOM_TOTAL_LENGTH = SLALOM_SEGMENT_LENGTHS.reduce((sum, value) => sum + value, 0);

function selectSlalomTarget(ctx: Parameters<NonNullable<Scenario['pilot']>>[0]): {
  progress: number;
  target: (typeof SLALOM_WAYPOINTS)[number];
} {
  const lastProgress = ctx.bus.get('obstaclePathProgress_e3', 0) / 1000;
  let targetIndex = Math.max(
    1,
    Math.min(SLALOM_WAYPOINTS.length - 1, Math.round(ctx.bus.get('obstacleWaypointIndex', 1))),
  );
  const projection = projectOnSlalomPath(
    ctx.telemetry.positionX,
    ctx.telemetry.positionZ,
    lastProgress,
  );
  let progress = Math.max(lastProgress, projection.progress);
  while (targetIndex < SLALOM_WAYPOINTS.length - 1) {
    const target = SLALOM_WAYPOINTS[targetIndex]!;
    const radius = slalomWaypointRadius(target.id);
    const distanceReached =
      Math.hypot(ctx.telemetry.positionX - target.x, ctx.telemetry.positionZ - target.z) <= radius;
    const targetProgress = SLALOM_CUMULATIVE_LENGTHS[targetIndex] ?? SLALOM_TOTAL_LENGTH;
    const progressReached =
      target.id === 'finish' && progress >= targetProgress - WAYPOINT_PROGRESS_MARGIN_M;
    if (!distanceReached && !progressReached) {
      break;
    }
    targetIndex += 1;
  }
  const progressLimit = SLALOM_CUMULATIVE_LENGTHS[targetIndex] ?? SLALOM_TOTAL_LENGTH;
  progress = Math.max(lastProgress, Math.min(progress, progressLimit));
  ctx.bus.set('obstaclePathProgress_e3', Math.round(progress * 1000));
  ctx.bus.set('obstacleWaypointIndex', targetIndex);
  return {
    progress,
    target: SLALOM_WAYPOINTS[targetIndex]!,
  };
}

function slalomWaypointRadius(id: string): number {
  if (id.startsWith('switch')) return SWITCH_RADIUS_M;
  if (id.startsWith('pass')) return PASS_WAYPOINT_RADIUS_M;
  return LANE_WAYPOINT_RADIUS_M;
}

function distanceToSlalomPath(x: number, z: number): number {
  return projectOnSlalomPath(x, z, 0).error;
}

function projectOnSlalomPath(
  x: number,
  z: number,
  minProgress: number,
): { progress: number; error: number } {
  let best = Number.POSITIVE_INFINITY;
  let bestProgress = 0;
  let progressAtSegmentStart = 0;
  for (let i = 1; i < SLALOM_WAYPOINTS.length; i += 1) {
    const a = SLALOM_WAYPOINTS[i - 1]!;
    const b = SLALOM_WAYPOINTS[i]!;
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const lenSq = vx * vx + vz * vz;
    const u = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / lenSq));
    const progress = progressAtSegmentStart + (SLALOM_SEGMENT_LENGTHS[i - 1] ?? 0) * u;
    progressAtSegmentStart += SLALOM_SEGMENT_LENGTHS[i - 1] ?? 0;
    if (progress < minProgress) continue;
    const px = a.x + vx * u;
    const pz = a.z + vz * u;
    const error = Math.hypot(x - px, z - pz);
    if (error < best) {
      best = error;
      bestProgress = progress;
    }
  }
  return { progress: bestProgress, error: best };
}

export const obstacleAvoidance: Scenario = {
  id: 'obstacleAvoidance',
  title: 'Объезд препятствий',
  category: 'mission',
  description:
    'Автопилот ведёт робота из старта (-3, 0) к финишу (+3, 0), объезжая 4 барьера на центральной линии слаломом. Метрика = время + 2с × N столкновений + ошибка маршрута.',
  initialPose: { x: -3, z: 0, yaw: 0 },
  timeoutSec: 40,
  isAutonomyAllowed: true,

  pilot: (ctx) => {
    const { progress, target } = selectSlalomTarget(ctx);
    const isFinalLeg = target.id === 'finish' || progress >= SLALOM_TOTAL_LENGTH - 1.1;
    goToTarget(ctx, {
      targetX: target.x,
      targetZ: target.z,
      arriveRadius: isFinalLeg ? FINISH_RADIUS * 0.75 : 0.12,
      cruiseThrottle: isFinalLeg ? FINAL_CRUISE_THROTTLE : SLALOM_CRUISE_THROTTLE,
      turnGain: 2.4,
      yawErrThrottleCut: 1.05,
      minMoveThrottle: 0.2,
    });
  },

  setup: (ctx) => (
    <group>
      {OBSTACLES.map((o) => (
        <RigidBody
          key={o.id}
          type="fixed"
          position={[o.x, BLOCK_HALF[1], o.z]}
          colliders={false}
          userData={{ role: 'arena-static', objectId: `obstacle-barrier-${o.id}` }}
          onCollisionEnter={(p) => {
            // Учитываем только шасси: колёса/ротор могут задеть барьер отдельными
            // коллайдерами и раздуть счётчик без нового события уровня миссии.
            if (
              ctx.bus.get('obstacleCollisionArmed', 0) === 1 &&
              p.other.rigidBodyObject?.userData.role === 'chassis'
            ) {
              ctx.bus.emit('collisions');
            }
          }}
        >
          <CuboidCollider args={BLOCK_HALF} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[BLOCK_HALF[0] * 2, BLOCK_HALF[1] * 2, BLOCK_HALF[2] * 2]} />
            <meshStandardMaterial color="#d05a4a" roughness={0.7} />
          </mesh>
        </RigidBody>
      ))}

      {SLALOM_WAYPOINTS.slice(1, -1).map((p) => (
        <SceneMarkerRing
          key={p.id}
          position={[p.x, p.z]}
          innerRadius={0.12}
          outerRadius={0.16}
          color={p.z > 0 ? '#00d4ff' : '#ff3ea5'}
          opacity={0.75}
          segments={24}
        />
      ))}
      <SceneMarkerRing
        position={[FINISH_X, 0]}
        innerRadius={FINISH_RADIUS - 0.05}
        outerRadius={FINISH_RADIUS}
        color="#3ad29f"
        opacity={0.8}
      />
      <SceneMarkerRing
        position={[-3, 0]}
        innerRadius={0.4}
        outerRadius={0.5}
        color="#6f4cff"
        opacity={0.6}
      />
    </group>
  ),

  metric: (ctx) => {
    ctx.bus.set('obstacleCollisionArmed', ctx.elapsedSec >= COLLISION_ARM_SEC ? 1 : 0);
    const trackingError = distanceToSlalomPath(ctx.telemetry.positionX, ctx.telemetry.positionZ);
    ctx.bus.emit('trackingErr_e3', Math.round(trackingError * ctx.dt * 1000));
    return (
      ctx.elapsedSec +
      COLLISION_PENALTY_SEC * ctx.bus.count('collisions') +
      TRACKING_ERROR_WEIGHT * (ctx.bus.count('trackingErr_e3') / 1000)
    );
  },

  goal: (ctx) => {
    const dx = ctx.telemetry.positionX - FINISH_X;
    const dz = ctx.telemetry.positionZ;
    const slalomComplete =
      ctx.bus.get('obstacleWaypointIndex', 1) >= SLALOM_WAYPOINTS.length - 1 &&
      ctx.bus.get('obstaclePathProgress_e3', 0) / 1000 >= SLALOM_TOTAL_LENGTH - 0.8;
    return slalomComplete && Math.hypot(dx, dz) < FINISH_RADIUS;
  },

  summary: (ctx) => ({
    obstacle_collisions: ctx.bus.count('collisions'),
    slalom_waypoint_index: ctx.bus.get('obstacleWaypointIndex', 1),
    slalom_path_progress_m: ctx.bus.get('obstaclePathProgress_e3', 0) / 1000,
    tracking_error_integral_m_s: ctx.bus.count('trackingErr_e3') / 1000,
  }),
};

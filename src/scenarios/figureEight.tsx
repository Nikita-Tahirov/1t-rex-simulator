import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { GROUND_LAYER_Y } from '@/physics/groundLayers.ts';
import { goToTarget } from './_pilotHelpers.ts';
import type { Scenario } from './manager.ts';

/**
 * Сценарий «Восьмёрка» — автономный объезд двух стоек по траектории Лиссажу.
 *
 * Два **физических** конуса сидят в центрах двух петель Лиссажу на оси X.
 * Робот стартует в (0, 0) лицом к +X и должен прошить восьмёрку: правая петля
 * огибает правый конус, левая — левый, затем возврат к старту. Конусы имеют коллайдер; задеть их
 * = штраф к метрике.
 *
 * Waypoint-контур задаёт безопасные касательные вокруг конусов и
 * управляется PD-регулятором по yaw.
 *
 * **Метрика** = кумулятивная RMSE ⊕ COLLISION_PENALTY · столкновения.
 *
 * Цель: после ≥ MIN_LAP_SEC робот в радиусе 1.0 м от старта, без активных
 * столкновений в последний момент.
 */

const CONE_RADIUS = 0.15;
const CONE_HEIGHT = 0.6;
const CONE_OFFSET_X = 1.85;
const FIGURE_OUTER_X = CONE_OFFSET_X + 1.35;
const FIGURE_LOOP_Z = 1.45;
const FIGURE_IDEAL_AMPLITUDE_X = CONE_OFFSET_X + 1.15;
const PERIOD_SEC = 30;
const OMEGA = (2 * Math.PI) / PERIOD_SEC;
const MIN_LAP_SEC = 25;
const WAYPOINT_REACHED_RADIUS = 0.38;
const WAYPOINT_ADVANCE_PROGRESS = 0.92;
const COLLISION_PENALTY = 1.5;
const FINISH_SPEED_MPS = 3;
const START_POINT = { x: 0, z: 0 } as const;
// Waypoint-ы построены так, чтобы петли уверенно огибали конусы
// с боковым зазором ≥ 1.1 м (CONE_RADIUS=0.15 + полуширина шасси 0.42 +
// запас на поворот корпуса и headless/e2e jitter).
const WAYPOINTS: Array<{ x: number; z: number }> = [
  { x: 0, z: FIGURE_LOOP_Z },
  { x: CONE_OFFSET_X, z: FIGURE_LOOP_Z },
  { x: FIGURE_OUTER_X, z: 0 },
  { x: CONE_OFFSET_X, z: -FIGURE_LOOP_Z },
  { x: 0, z: -FIGURE_LOOP_Z },
  { x: 0, z: 0 },
  { x: 0, z: FIGURE_LOOP_Z },
  { x: -CONE_OFFSET_X, z: FIGURE_LOOP_Z },
  { x: -FIGURE_OUTER_X, z: 0 },
  { x: -CONE_OFFSET_X, z: -FIGURE_LOOP_Z },
  { x: 0, z: -FIGURE_LOOP_Z },
  { x: 0, z: 0 },
];

const CONES = [
  { id: 'left', x: -CONE_OFFSET_X, z: 0 },
  { id: 'right', x: CONE_OFFSET_X, z: 0 },
] as const;

/** Точка-цель на траектории Лиссажу в момент времени t. */
function lissajousAt(t: number): { x: number; z: number } {
  return {
    x: FIGURE_IDEAL_AMPLITUDE_X * Math.sin(OMEGA * t),
    z: Math.sin(2 * OMEGA * t),
  };
}

function segmentProgress(
  x: number,
  z: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
): number {
  const vx = to.x - from.x;
  const vz = to.z - from.z;
  const lenSq = vx * vx + vz * vz;
  return lenSq === 0 ? 1 : ((x - from.x) * vx + (z - from.z) * vz) / lenSq;
}

function selectFigureTarget(ctx: Parameters<NonNullable<Scenario['pilot']>>[0]): {
  target: (typeof WAYPOINTS)[number];
  index: number;
} {
  let targetIndex = Math.max(
    0,
    Math.min(WAYPOINTS.length - 1, Math.round(ctx.bus.get('figureWaypointIndex', 0))),
  );
  while (targetIndex < WAYPOINTS.length - 1) {
    const prev = targetIndex === 0 ? START_POINT : WAYPOINTS[targetIndex - 1]!;
    const target = WAYPOINTS[targetIndex]!;
    const dist = Math.hypot(target.x - ctx.telemetry.positionX, target.z - ctx.telemetry.positionZ);
    const progress = segmentProgress(
      ctx.telemetry.positionX,
      ctx.telemetry.positionZ,
      prev,
      target,
    );
    if (dist > WAYPOINT_REACHED_RADIUS && progress < WAYPOINT_ADVANCE_PROGRESS) break;
    targetIndex += 1;
  }
  ctx.bus.set('figureWaypointIndex', targetIndex);
  return { target: WAYPOINTS[targetIndex]!, index: targetIndex };
}

export const figureEight: Scenario = {
  id: 'figureEight',
  title: 'Восьмёрка',
  category: 'mission',
  description:
    'Автопилот ведёт робота по восьмёрке вокруг двух физических конусов через безопасные waypoint-ы. Метрика = RMSE + штраф за контакт.',
  initialPose: { x: 0, z: 0, yaw: 0 },
  timeoutSec: 60,
  isAutonomyAllowed: true,

  pilot: (ctx) => {
    const { target } = selectFigureTarget(ctx);
    goToTarget(ctx, {
      targetX: target.x,
      targetZ: target.z,
      arriveRadius: 0.3,
      cruiseThrottle: 0.48,
      turnGain: 1.7,
      yawErrThrottleCut: 0.68,
      minMoveThrottle: 0.32,
    });
  },

  setup: (ctx) => (
    <group>
      {CONES.map((c) => (
        <RigidBody
          key={c.id}
          type="fixed"
          position={[c.x, CONE_HEIGHT / 2, c.z]}
          colliders={false}
          userData={{ role: 'arena-static', objectId: `figure-cone-${c.id}` }}
          onCollisionEnter={(p) => {
            // Учитываем только контакт шасси: колёса/ротор могут скользнуть
            // по основанию конуса отдельным коллайдером и удвоить счётчик.
            if (p.other.rigidBodyObject?.userData.role === 'chassis') {
              ctx.bus.emit('collisions');
            }
          }}
        >
          <CylinderCollider args={[CONE_HEIGHT / 2, CONE_RADIUS]} />
          <mesh castShadow>
            <cylinderGeometry args={[CONE_RADIUS * 0.4, CONE_RADIUS, CONE_HEIGHT, 24]} />
            <meshStandardMaterial
              color="#ffb547"
              emissive="#ff8a00"
              emissiveIntensity={0.18}
              roughness={0.55}
              metalness={0.18}
            />
          </mesh>
          {/* Белая светоотражающая полоса посередине конуса — Industrial-канон. */}
          <mesh position={[0, 0, 0]} castShadow>
            <cylinderGeometry
              args={[CONE_RADIUS * 0.7, CONE_RADIUS * 0.78, CONE_HEIGHT * 0.13, 24]}
            />
            <meshStandardMaterial
              color="#f4f4f4"
              emissive="#ffffff"
              emissiveIntensity={0.22}
              roughness={0.4}
              metalness={0.05}
            />
          </mesh>
          {/* Подсветка основания — визуальная зона запрета. Мировой Y =
              ROOT(CONE_HEIGHT/2) + LOCAL = поднимаем до GROUND_LAYER_Y.coneBase. */}
          <mesh
            position={[0, -CONE_HEIGHT / 2 + GROUND_LAYER_Y.coneBase, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[CONE_RADIUS, CONE_RADIUS + 0.08, 32]} />
            <meshBasicMaterial
              color="#ff8a00"
              transparent
              opacity={0.55}
              polygonOffset
              polygonOffsetFactor={-6}
              polygonOffsetUnits={-6}
              depthWrite={false}
            />
          </mesh>
        </RigidBody>
      ))}

      {/* Маркер стартовой точки (визуальный, без коллайдера) */}
      <mesh position={[0, GROUND_LAYER_Y.sceneMarker, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.6, 32]} />
        <meshBasicMaterial
          color="#3ad29f"
          transparent
          opacity={0.7}
          polygonOffset
          polygonOffsetFactor={-5}
          polygonOffsetUnits={-5}
          depthWrite={false}
        />
      </mesh>
    </group>
  ),

  metric: (ctx) => {
    const ideal = lissajousAt(ctx.elapsedSec);
    const dx = ctx.telemetry.positionX - ideal.x;
    const dz = ctx.telemetry.positionZ - ideal.z;
    const instantErr = Math.hypot(dx, dz);
    ctx.bus.emit('cumulativeErr_e3', Math.round(instantErr * ctx.dt * 1000));
    const rmse = ctx.bus.count('cumulativeErr_e3') / 1000;
    const collisions = ctx.bus.count('collisions');
    return rmse + COLLISION_PENALTY * collisions;
  },

  goal: (ctx) => {
    if (ctx.elapsedSec < MIN_LAP_SEC) return false;
    if (ctx.bus.get('figureWaypointIndex', 0) < WAYPOINTS.length - 1) return false;
    const dist = Math.hypot(ctx.telemetry.positionX, ctx.telemetry.positionZ);
    return dist < 1.0 && ctx.telemetry.speed < FINISH_SPEED_MPS;
  },

  summary: (ctx) => ({
    figure_collisions: ctx.bus.count('collisions'),
    figure_waypoint_index: ctx.bus.get('figureWaypointIndex', 0),
    figure_rmse_m_s: ctx.bus.count('cumulativeErr_e3') / 1000,
  }),
};

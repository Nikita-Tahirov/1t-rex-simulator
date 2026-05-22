/**
 * Имитация лазерного дальномера 1T-REX в виде планарного лидара.
 *
 * Реальный 1T-REX (см. практику Никиты, SensorService) оснащён одиночным
 * лазерным дальномером + IMU. Для целей симуляции автономного объезда
 * препятствий мы расширяем модель до планарного лидара — N лучей в
 * горизонтальной плоскости, пристрелянных в FOV вокруг forward-вектора.
 * Это canonical-источник восприятия для reactive-avoidance (APF/VFH).
 *
 * Геометрия согласована с {@link LIDAR_BEAM_ANGLES}: индекс i ↔ угол в
 * robot frame, где 0 = forward, +π/2 = вправо (game-convention yaw).
 *
 * Hot-path-инвариант проекта:
 *   • Никаких аллокаций per-frame: tuples ranges/hitX/hitZ/normalX/normalZ
 *     мутируются in-place; `LidarFrame` живёт в valtio-proxy.
 *   • Подписчики (HUD-визуализатор, pilot) читают тот же объект через
 *     прямой доступ — valtio триггерит ре-рендер только тех компонентов,
 *     которые читают конкретные индексы.
 */

import { proxy } from 'valtio';

/** Количество лучей. 16 — компромисс: достаточно для APF, дёшево по cast-у. */
export const LIDAR_BEAM_COUNT: number = 16;

/** Полный угол обзора, рад. ±90° = π охватывает фронтальную полусферу. */
export const LIDAR_FOV_RAD = Math.PI;

/** Максимальная дальность, м. Реальный лазерный дальномер 1T-REX ≈ 4 м. */
export const LIDAR_MAX_RANGE_M = 4;

/** Высота луча над полом арены, м. Стартовая высота шасси 0.21 м (см. ROBOT.chassisStartHeight). */
export const LIDAR_BEAM_HEIGHT_M = 0.18;

/**
 * Углы лучей в robot frame, заранее вычислены ради hot-path.
 * `angle[0] = -π/2` (крайне-левый), `angle[N-1] = +π/2` (крайне-правый).
 *
 * Robot frame, game-convention: `forward = (cos yaw, 0, sin yaw)`. Положительный
 * угол луча сдвигает направление в сторону +Z в robot frame, т.е. вправо
 * относительно forward (см. _pilotHelpers.ts).
 */
export const LIDAR_BEAM_ANGLES: readonly number[] = Array.from(
  { length: LIDAR_BEAM_COUNT },
  (_, i) => {
    if (LIDAR_BEAM_COUNT === 1) return 0;
    return -LIDAR_FOV_RAD / 2 + (LIDAR_FOV_RAD * i) / (LIDAR_BEAM_COUNT - 1);
  },
);

/**
 * Снимок данных лидара, переиспользуется in-place. Все массивы фиксированной
 * длины LIDAR_BEAM_COUNT — мутируем по индексу, identity не меняем.
 */
export interface LidarFrame {
  /** Время последнего обновления, с (performance.now()/1000). */
  timestamp: number;
  /** Сенсор активен (рассчитывается каждый кадр). */
  active: boolean;
  /** Дальность по каждому лучу, м. INF, если ничего не попалось в FOV. */
  ranges: number[];
  /** Hit-point X в мире (для визуализации). */
  hitX: number[];
  /** Hit-point Z в мире. */
  hitZ: number[];
  /** Нормаль препятствия X (в мире). 0, если нет hit-а. */
  normalX: number[];
  /** Нормаль препятствия Z. */
  normalZ: number[];
  /** Минимальная дальность среди всех лучей, м. */
  minRange: number;
  /** Угол в robot frame того луча, у которого зафиксирован minRange, рад. */
  minBearingRad: number;
}

function makeBuf(): number[] {
  return new Array(LIDAR_BEAM_COUNT).fill(0);
}

export const lidar: LidarFrame = proxy<LidarFrame>({
  timestamp: 0,
  active: false,
  ranges: new Array(LIDAR_BEAM_COUNT).fill(Number.POSITIVE_INFINITY),
  hitX: makeBuf(),
  hitZ: makeBuf(),
  normalX: makeBuf(),
  normalZ: makeBuf(),
  minRange: Number.POSITIVE_INFINITY,
  minBearingRad: 0,
});

/**
 * Сбрасывает все буферы лидара в «нет данных». Используется при unmount
 * сенсора и перед стартом нового сценария — чтобы старая «картина мира»
 * не подхватывалась pilot-функциями нового прогона.
 */
export function resetLidar(): void {
  lidar.active = false;
  for (let i = 0; i < LIDAR_BEAM_COUNT; i += 1) {
    lidar.ranges[i] = Number.POSITIVE_INFINITY;
    lidar.hitX[i] = 0;
    lidar.hitZ[i] = 0;
    lidar.normalX[i] = 0;
    lidar.normalZ[i] = 0;
  }
  lidar.minRange = Number.POSITIVE_INFINITY;
  lidar.minBearingRad = 0;
}

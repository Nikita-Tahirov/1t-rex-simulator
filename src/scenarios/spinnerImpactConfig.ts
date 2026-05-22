/**
 * @packageDocumentation
 * Параметры миссии `spinnerImpact` — удар вертикального ротора по бронепанели.
 * Все скаляры в СИ (м, с, об/мин). Условие зачёта удара (`pilot → motion → impact`):
 * raw RPM ≥ {@link IMPACT_RPM} ∧ |v| ≥ {@link IMPACT_SPEED_MPS} ∧
 * расстояние ≤ {@link IMPACT_RADIUS_M}, при том что предварительно достигнута
 * готовность {@link READY_RPM} и пилот успел в окно {@link SPINUP_TIMEOUT_SEC}.
 *
 * Параметры зафиксированы для воспроизводимости главы § 3.1 ВКР.
 */

import { ROBOT } from '@/physics/constants.ts';

/** Целевая X-координата центра броне-панели на арене, м. */
export const TARGET_X = 2.4;
/** Целевая Z-координата центра броне-панели на арене, м. */
export const TARGET_Z = 0;
/** Half-extents AABB броне-панели (плоский «щит» по оси Z), м. */
export const TARGET_HALF: [number, number, number] = [0.08, 0.45, 0.75];
/** Стартовая X-позиция робота при инициализации сценария, м. */
export const START_X = -2.2;
/** Стартовая Z-позиция робота, м. */
export const START_Z = 0;
/** Целевая (peak) угловая скорость ротора в режиме готовности, об/мин. */
export const TARGET_RPM = 5200;
/** Порог «готов к удару» — ниже этого RPM пилот не идёт на сближение, об/мин. */
export const READY_RPM = 3000;
/** Минимальный RPM в момент контакта, иначе удар не засчитывается, об/мин. */
export const IMPACT_RPM = 2800;
/** Минимальная путевая скорость шасси в момент контакта, м/с. */
export const IMPACT_SPEED_MPS = 0.45;
/** Радиус засчитывания контакта вокруг ротора, м. */
export const IMPACT_RADIUS_M = 0.45;
/** Допустимое время раскрутки до READY_RPM от старта сценария, с. */
export const SPINUP_TIMEOUT_SEC = 3.0;
/** Дальность ротора от центра шасси с поправкой на CAD-смещение, м. */
export const WEAPON_REACH_M = ROBOT.spinnerOffsetX + ROBOT.spinnerRadius + 0.22;
/** Допуск пост-фактум логирования impact-события при пересечении радиуса, м. */
export const IMPACT_LOG_TOLERANCE_M = 0.05;
/** Максимально допустимое расстояние шасси→цель в момент логирования контакта, м. */
export const MAX_CHASSIS_TARGET_DIST_M = WEAPON_REACH_M + IMPACT_RADIUS_M + IMPACT_LOG_TOLERANCE_M;

/**
 * Кинетическая энергия ротора как тонкого диска радиуса {@link ROBOT.spinnerRadius}
 * и массы {@link ROBOT.spinnerMass}, вращающегося с заданной частотой.
 *
 * @param rpm — обороты ротора в минуту (clamp ≥ 0).
 * @returns Энергия в джоулях. Используется в JSON-логе для оценки удара.
 *
 * @example
 * spinnerEnergyJ(5200) // ≈ 0.5 × m × r² × ω², ω = 2π × 5200/60
 */
export function spinnerEnergyJ(rpm: number): number {
  const omega = (Math.max(0, rpm) * 2 * Math.PI) / 60;
  const inertia = ROBOT.spinnerMass * ROBOT.spinnerRadius * ROBOT.spinnerRadius;
  return 0.5 * inertia * omega * omega;
}

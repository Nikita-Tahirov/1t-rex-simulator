/**
 * @packageDocumentation
 * Модель целостности шасси 1T-REX. Чистые pure-функции без зависимостей от
 * Rapier/React, поэтому используются и в hot-path физики, и в unit-тестах.
 * Источники урона ({@link RobotDamageSource}) — `shredder` (зона A: непрерывный
 * урон от ротора-шредера) и `impact` (контакт со стенами/коробками с порогом
 * упругости).
 *
 * Уровень `health` ∈ [0; {@link ROBOT_MAX_HEALTH}] нормализуется в
 * {@link RobotIntegrityBand} для HUD и сценарных метрик.
 */

import { clamp } from '@/lib/math.ts';
import { PHYSICS, ROBOT } from './constants.ts';

/** Полное здоровье шасси при старте сценария. */
export const ROBOT_MAX_HEALTH = 1000;
/** Минимальный интервал между двумя impact-событиями, мс. Защищает от двойного учёта. */
export const ROBOT_IMPACT_DAMAGE_COOLDOWN_MS = 280;

/** Источник последнего применённого урона (или `none` если урона ещё не было). */
export type RobotDamageSource = 'none' | 'shredder' | 'impact';
/** Качественная градация состояния шасси для HUD/сценариев. */
export type RobotIntegrityBand = 'nominal' | 'worn' | 'damaged' | 'critical' | 'disabled';

const ELASTIC_IMPACT_ENERGY_J = 90;
const IMPACT_JOULES_PER_DAMAGE = 18;
const IMPACT_DAMAGE_CAP = 140;
const FORCE_DAMAGE_THRESHOLD_J = 35;
const FORCE_JOULES_PER_DAMAGE = 16;

/** Изменяемое (immutable per-step) состояние целостности шасси. */
export interface RobotDamageState {
  health: number;
  damage: number;
  lastSource: RobotDamageSource;
  lastAtMs: number;
  lastEnergyJ: number;
  lastForceN: number;
}

/** Одно событие нанесения урона. `nowMs` — симуляционное время. */
export interface RobotDamageEvent {
  amount: number;
  source: Exclude<RobotDamageSource, 'none'>;
  nowMs: number;
  energyJ?: number;
  forceN?: number;
}

/** Входы расчёта impact-урона по контакту шасси с препятствием. */
export interface ImpactDamageInput {
  speedMps: number;
  contactForceN?: number;
  massKg?: number;
  timestepSec?: number;
}

/** Инициализатор: полное здоровье, нулевая история урона. */
export function createRobotDamageState(): RobotDamageState {
  return {
    health: ROBOT_MAX_HEALTH,
    damage: 0,
    lastSource: 'none',
    lastAtMs: -Infinity,
    lastEnergyJ: 0,
    lastForceN: 0,
  };
}

/** Доля оставшегося здоровья в [0; 1]. */
export function robotHealthRatio(health: number): number {
  return clamp(health / ROBOT_MAX_HEALTH, 0, 1);
}

/** Сопоставление абсолютного health градации band для HUD/сценарных целей. */
export function robotIntegrityBand(health: number): RobotIntegrityBand {
  const ratio = robotHealthRatio(health);
  if (ratio <= 0) return 'disabled';
  if (ratio < 0.18) return 'critical';
  if (ratio < 0.45) return 'damaged';
  if (ratio < 0.72) return 'worn';
  return 'nominal';
}

/**
 * Применяет одно событие урона к immutable-состоянию. Не мутирует вход,
 * возвращает новый объект; при `event.amount ≤ 0` или `state.health ≤ 0`
 * возвращает исходное состояние без изменений (idempotent).
 */
export function applyRobotDamageState(
  state: RobotDamageState,
  event: RobotDamageEvent,
): RobotDamageState {
  if (!Number.isFinite(event.amount) || event.amount <= 0 || state.health <= 0) return state;
  const applied = Math.min(state.health, event.amount);
  return {
    health: state.health - applied,
    damage: state.damage + applied,
    lastSource: event.source,
    lastAtMs: event.nowMs,
    lastEnergyJ: Math.max(0, event.energyJ ?? 0),
    lastForceN: Math.max(0, event.forceN ?? 0),
  };
}

/**
 * Считает дельту урона при impact-контакте. Энергия складывается из двух
 * слагаемых: кинетика шасси и работа импульса контакта; берётся максимум.
 * Возвращает кэп {@link IMPACT_DAMAGE_CAP} в верхнем пределе.
 */
export function computeImpactDamageDelta({
  speedMps,
  contactForceN = 0,
  massKg = ROBOT.chassisMass,
  timestepSec = PHYSICS.timestep,
}: ImpactDamageInput): { damage: number; kineticEnergyJ: number; impulseEnergyJ: number } {
  const speed = Math.max(0, speedMps);
  const kineticEnergyJ = 0.5 * massKg * speed * speed;
  const impulseNsec = Math.max(0, contactForceN) * timestepSec;
  const impulseEnergyJ = (impulseNsec * impulseNsec) / (2 * massKg);
  const speedDamage =
    Math.max(0, kineticEnergyJ - ELASTIC_IMPACT_ENERGY_J) / IMPACT_JOULES_PER_DAMAGE;
  const forceDamage =
    Math.max(0, impulseEnergyJ - FORCE_DAMAGE_THRESHOLD_J) / FORCE_JOULES_PER_DAMAGE;
  return {
    damage: Math.min(IMPACT_DAMAGE_CAP, Math.max(speedDamage, forceDamage)),
    kineticEnergyJ,
    impulseEnergyJ,
  };
}

/**
 * Возвращает `true`, если `role` соответствует объекту, контакт с которым должен
 * наносить impact-урон шасси. Источник истины для фильтрации contact-событий
 * в `Robot.tsx` и тестах коллизий.
 */
export function isDamagingArenaRole(role: unknown): boolean {
  return (
    role === 'arena-wall' ||
    role === 'arena-static' ||
    role === 'damage-crate' ||
    role === 'shredder-rotor'
  );
}

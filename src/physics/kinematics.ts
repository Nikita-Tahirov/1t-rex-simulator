/**
 * Кинематика skid-steer (танкового) шасси с 4 независимыми приводами.
 *
 * Геометрия: 4 колеса по углам прямоугольного шасси.
 *   • L — расстояние между осями (длина базы)
 *   • W — расстояние между колеями (ширина базы) — половина её называется trackHalf
 *   • r — радиус колеса
 *
 * Каждое колесо имеет свой ω. Для skid-steer объединяем по сторонам:
 *   ω_left  = (ω_FL + ω_RL) / 2
 *   ω_right = (ω_FR + ω_RR) / 2
 *   v       = (ω_left + ω_right) * r / 2
 *   ψ̇      = (ω_right − ω_left) * r / W
 *
 * Обратная задача — даны (v, ψ̇) → требуемые ω для левой и правой пары.
 *
 * Допущения (ВКР):
 *   • Колёса не проскальзывают (идеальная skid-steer кинематика). Реально на грунте
 *     skid-steer всегда сопровождается боковым проскальзыванием, особенно при поворотах.
 *     Динамика проскальзывания моделируется в Rapier; здесь — только кинематика.
 *   • Передняя и задняя пары вращаются с одинаковой скоростью (объединение по стороне).
 */

import { clamp } from '@/lib/math.ts';

export interface VehicleGeometry {
  /** Расстояние между передней и задней осью, м. */
  wheelbase: number;
  /** Расстояние между левой и правой колеёй, м. */
  trackWidth: number;
  /** Радиус колеса, м. */
  wheelRadius: number;
}

export interface WheelSpeeds {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
}

export interface BodyVelocity {
  /** Линейная скорость вдоль продольной оси, м/с. */
  linear: number;
  /** Угловая скорость вокруг вертикали (рыскание), рад/с. */
  angular: number;
}

/** Прямая задача: ω колёс → (v, ψ̇). */
export function wheelsToBody(wheels: WheelSpeeds, geometry: VehicleGeometry): BodyVelocity {
  const left = (wheels.frontLeft + wheels.rearLeft) / 2;
  const right = (wheels.frontRight + wheels.rearRight) / 2;
  const linear = ((left + right) * geometry.wheelRadius) / 2;
  const angular = ((right - left) * geometry.wheelRadius) / geometry.trackWidth;
  return { linear, angular };
}

/** Обратная задача: задание (v, ψ̇) → необходимые ω сторон (одинаковые передняя+задняя). */
export function bodyToWheels(target: BodyVelocity, geometry: VehicleGeometry): WheelSpeeds {
  const halfTurn = (target.angular * geometry.trackWidth) / 2;
  const leftSide = (target.linear - halfTurn) / geometry.wheelRadius;
  const rightSide = (target.linear + halfTurn) / geometry.wheelRadius;
  return {
    frontLeft: leftSide,
    rearLeft: leftSide,
    frontRight: rightSide,
    rearRight: rightSide,
  };
}

/** In-place вариант для hot path: заполняет `out` без аллокации. */
export function bodyToWheelsInto(
  out: WheelSpeeds,
  target: BodyVelocity,
  geometry: VehicleGeometry,
): void {
  const halfTurn = (target.angular * geometry.trackWidth) / 2;
  const leftSide = (target.linear - halfTurn) / geometry.wheelRadius;
  const rightSide = (target.linear + halfTurn) / geometry.wheelRadius;
  out.frontLeft = leftSide;
  out.rearLeft = leftSide;
  out.frontRight = rightSide;
  out.rearRight = rightSide;
}

/** Команды танкового стика → (v, ψ̇). throttle, turn ∈ [-1,1]; v_max, ψ̇_max — пределы. */
export function tankCommandToBody(
  throttle: number,
  turn: number,
  maxLinear: number,
  maxAngular: number,
): BodyVelocity {
  const t = clamp(throttle, -1, 1);
  const r = clamp(turn, -1, 1);
  return { linear: t * maxLinear, angular: -r * maxAngular };
}

/** In-place вариант для hot path: заполняет `out` без аллокации. */
export function tankCommandToBodyInto(
  out: BodyVelocity,
  throttle: number,
  turn: number,
  maxLinear: number,
  maxAngular: number,
): void {
  const t = clamp(throttle, -1, 1);
  const r = clamp(turn, -1, 1);
  out.linear = t * maxLinear;
  out.angular = -r * maxAngular;
}

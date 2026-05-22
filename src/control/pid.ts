/**
 * ПИД-регулятор с фильтром производной и anti-windup.
 *
 * Ссылка: эталонная реализация для симулятора и для прошивки на МИК32 «Амур»
 * (одинаковая структура и параметры; различия — только в типах данных и инициализации).
 *
 * Дискретная форма:
 *   e[k]   = setpoint - measurement
 *   I[k]   = clamp(I[k-1] + Ki * e[k] * dt, -iLimit, +iLimit)
 *   D[k]   = (1 - α) * D[k-1] + α * Kd * (e[k] - e[k-1]) / dt   (LP-фильтр)
 *   u[k]   = clamp(Kp*e[k] + I[k] + D[k], outMin, outMax)
 *
 * Anti-windup — по интегральной составляющей через clamp; дополнительно при
 * насыщении выхода интегратор «замораживается» (back-calculation вариант).
 */

import { clamp } from '@/lib/math.ts';

export interface PIDParams {
  kp: number;
  ki: number;
  kd: number;
  /** Постоянная времени LP-фильтра производной, [с]. 0 → отключить фильтр. */
  derivativeFilterTau?: number;
  /** Симметричный лимит интегральной составляющей. */
  integralLimit?: number;
  /** Лимиты выходного сигнала. */
  outputMin?: number;
  outputMax?: number;
}

export interface PIDState {
  integral: number;
  prevError: number;
  prevDerivative: number;
  prevOutput: number;
}

export class PIDController {
  private kp: number;
  private ki: number;
  private kd: number;
  private readonly derivativeFilterTau: number;
  private readonly integralLimit: number;
  private readonly outputMin: number;
  private readonly outputMax: number;

  private integral = 0;
  private prevError = 0;
  private prevDerivative = 0;
  private prevOutput = 0;
  private initialised = false;

  constructor(params: PIDParams) {
    this.kp = params.kp;
    this.ki = params.ki;
    this.kd = params.kd;
    this.derivativeFilterTau = params.derivativeFilterTau ?? 0;
    this.integralLimit = params.integralLimit ?? Number.POSITIVE_INFINITY;
    this.outputMin = params.outputMin ?? Number.NEGATIVE_INFINITY;
    this.outputMax = params.outputMax ?? Number.POSITIVE_INFINITY;
  }

  setGains(kp: number, ki: number, kd: number): void {
    // Семантика «ki=0 = интегральный канал выключен»: накопленное значение
    // больше не используется и должно быть очищено. Иначе при перекручивании
    // ki в ноль остаточный integral продолжает давать output ≠ 0, и контур
    // ведёт себя так, будто пользователь не «отключил I», а только заморозил.
    if (ki === 0 && this.ki !== 0) this.integral = 0;
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
  }

  /** Сброс внутреннего состояния (например, при смене setpoint или режима). */
  reset(): void {
    this.integral = 0;
    this.prevError = 0;
    this.prevDerivative = 0;
    this.prevOutput = 0;
    this.initialised = false;
  }

  /**
   * Мягкий anti-windup: гасит только интегральную составляющую, оставляя
   * состояние производной и prevError. Используется, когда выход контура
   * физически не может быть реализован (механический упор, насыщение
   * привода) — чтобы интегратор не копил «энергию» против стенки.
   */
  resetIntegral(): void {
    this.integral = 0;
  }

  /**
   * Один шаг регулятора.
   * @param setpoint Заданное значение
   * @param measurement Измеренное значение
   * @param dt Шаг времени, секунды (>0)
   * @returns Управляющее воздействие, ограниченное [outputMin, outputMax]
   */
  update(setpoint: number, measurement: number, dt: number): number {
    if (dt <= 0) return this.prevOutput;

    const error = setpoint - measurement;

    // Производная по ошибке с LP-фильтром.
    let derivative = 0;
    if (this.initialised) {
      const rawD = ((error - this.prevError) / dt) * this.kd;
      if (this.derivativeFilterTau > 0) {
        const alpha = dt / (this.derivativeFilterTau + dt);
        derivative = (1 - alpha) * this.prevDerivative + alpha * rawD;
      } else {
        derivative = rawD;
      }
    }

    // Условный интегратор: накапливаем только если выход не в насыщении
    // (back-calculation anti-windup, упрощённая форма).
    const proportional = this.kp * error;
    const tentativeIntegral = this.integral + this.ki * error * dt;
    const tentativeOutput = proportional + tentativeIntegral + derivative;

    if (tentativeOutput > this.outputMax && this.ki * error > 0) {
      // вышли вверх — не накапливаем дальше в положительную сторону
    } else if (tentativeOutput < this.outputMin && this.ki * error < 0) {
      // вышли вниз — не накапливаем дальше в отрицательную сторону
    } else {
      this.integral = tentativeIntegral;
    }
    // Симметричный clamp на сам интеграл (защита от случайного дрифта)
    if (this.integral > this.integralLimit) this.integral = this.integralLimit;
    if (this.integral < -this.integralLimit) this.integral = -this.integralLimit;

    const output = clamp(proportional + this.integral + derivative, this.outputMin, this.outputMax);

    this.prevError = error;
    this.prevDerivative = derivative;
    this.prevOutput = output;
    this.initialised = true;

    return output;
  }

  /** Снимок состояния для телеметрии/тестов. */
  snapshot(): PIDState {
    return {
      integral: this.integral,
      prevError: this.prevError,
      prevDerivative: this.prevDerivative,
      prevOutput: this.prevOutput,
    };
  }
}

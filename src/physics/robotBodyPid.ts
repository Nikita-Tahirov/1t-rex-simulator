/**
 * Контур регулирования скоростей корпуса 1T-REX (linear / angular) на базе
 * двух {@link PIDController}. Заменяет прежний low-pass `robotVelocityIntegrator`:
 * теперь kp/ki/kd из `useSimStore.drivePid` реально влияют на отклик робота на
 * команду `throttle/turn`, что и ожидается от инженерной панели "PID привода".
 *
 * Физическая интерпретация:
 *   • setpoint = target.linear / target.angular (м/с, рад/с) от пилота / сценария
 *   • measurement = текущая скорость корпуса (forward / angular)
 *   • выход PID = ускорение [м/с²] / [рад/с²], ограничено `accelLimit`
 *   • интегрируется в новую скорость: vNew = vPrev + acc * dt
 *
 * Асимметричный лимит ускорения (`accelCoastScale`) сохраняет наблюдение из
 * `robotVelocityIntegrator`: 95-кг шасси «выбегает» дольше, чем разгоняется
 * (LINEAR_TAU_COAST/LINEAR_TAU_ACCEL = 0.8/0.25 ≈ 3.2× асимметрия). Это
 * критично для slalom/centerline-сценариев: симметричный коастер заставляет
 * робота «застывать» на смене waypoint.
 *
 * Перенос на МК «Амур»: те же PIDController + clamp, разница только в типах
 * (`number` → `float`) и источнике measurement (Rapier kinematic-velocity →
 * энкодеры/IMU).
 */

import { PIDController } from '@/control/pid.ts';
import { clamp } from '@/lib/math.ts';
import type { PIDGains } from '@/store/sim-store.ts';

/**
 * Базовые масштабирующие коэффициенты переводят нормированные kp/ki/kd из UI
 * (диапазон 0..3) в эффективные коэффициенты PID в физических единицах.
 *
 * Подобраны так, что при `gains = { kp: 1, ki: 0, kd: 0 }` поведение
 * эквивалентно прежнему low-pass с τ_linear=0.25 c, τ_angular=0.08 c.
 *
 * Доказательство (linear): u = kp_eff·e + I·∫e + D·de/dt; при ki=kd=0:
 *   vNew = vPrev + kp_eff·(target - vPrev)·dt
 * Сравнение с low-pass vNew = vPrev + (target - vPrev)·dt/τ даёт
 *   kp_eff = 1/τ = 1/0.25 = 4 [1/с]
 * Аналогично угловая: kp_eff_ang = 1/0.08 = 12.5 [1/с].
 */
export const BODY_PID_BASE = {
  /** [1/с] — переводит нормированный kp в усиление ошибки скорости */
  kpLinear: 4,
  /** [1/с²] — ki накапливает ошибку скорости как ускорение */
  kiLinear: 2,
  /** [безразмерный] — kd работает по производной ошибки */
  kdLinear: 0.4,
  kpAngular: 12.5,
  kiAngular: 5,
  kdAngular: 0.6,
  /** Максимальное линейное ускорение, [м/с²]. ≈ maxLinearSpeed/τ_accel = 6.94/0.25. */
  linearAccelLimit: 28,
  /** Максимальное угловое ускорение, [рад/с²]. ≈ maxAngularSpeed/τ_angular = 3/0.08. */
  angularAccelLimit: 38,
  /** Ограничение интегральной составляющей — anti-windup для предотвращения
   *  overshoot, когда робот упирается в препятствие и error долго остаётся
   *  большим. ≤ ¼ от accelLimit, чтобы интегратор не доминировал. */
  linearIntegralLimit: 6,
  angularIntegralLimit: 8,
  /** Доля от accelLimit, доступная для торможения/выбега (LINEAR_TAU_ACCEL/LINEAR_TAU_COAST). */
  accelCoastScale: 0.31,
  /** LP-фильтр производной — гасит шум измерения скорости. */
  derivativeFilterTau: 0.02,
} as const;

export interface RobotBodyPidStep {
  /** Новая линейная скорость корпуса, [м/с]. */
  linear: number;
  /** Новая угловая скорость корпуса (yaw rate), [рад/с]. */
  angular: number;
  /** Применённое линейное ускорение после clamp, [м/с²] — для телеметрии/тестов. */
  linearAccel: number;
  /** Применённое угловое ускорение после clamp, [рад/с²]. */
  angularAccel: number;
}

export class RobotBodyPid {
  private readonly linear = new PIDController({
    kp: BODY_PID_BASE.kpLinear,
    ki: 0,
    kd: 0,
    derivativeFilterTau: BODY_PID_BASE.derivativeFilterTau,
    outputMin: -BODY_PID_BASE.linearAccelLimit,
    outputMax: BODY_PID_BASE.linearAccelLimit,
    integralLimit: BODY_PID_BASE.linearIntegralLimit,
  });
  private readonly angular = new PIDController({
    kp: BODY_PID_BASE.kpAngular,
    ki: 0,
    kd: 0,
    derivativeFilterTau: BODY_PID_BASE.derivativeFilterTau,
    outputMin: -BODY_PID_BASE.angularAccelLimit,
    outputMax: BODY_PID_BASE.angularAccelLimit,
    integralLimit: BODY_PID_BASE.angularIntegralLimit,
  });

  /** Применить нормированные gains из UI (kp/ki/kd в диапазоне 0..3). */
  setGains(gains: PIDGains): void {
    this.linear.setGains(
      gains.kp * BODY_PID_BASE.kpLinear,
      gains.ki * BODY_PID_BASE.kiLinear,
      gains.kd * BODY_PID_BASE.kdLinear,
    );
    this.angular.setGains(
      gains.kp * BODY_PID_BASE.kpAngular,
      gains.ki * BODY_PID_BASE.kiAngular,
      gains.kd * BODY_PID_BASE.kdAngular,
    );
  }

  /**
   * Один шаг контура. Возвращает новую скорость корпуса и применённое ускорение
   * после clamp; вызывающая сторона интегрирует её в позу шасси.
   */
  step(
    targetLinear: number,
    targetAngular: number,
    currentLinear: number,
    currentAngular: number,
    dt: number,
    out: RobotBodyPidStep,
  ): RobotBodyPidStep {
    const rawLinAcc = this.linear.update(targetLinear, currentLinear, dt);
    const rawAngAcc = this.angular.update(targetAngular, currentAngular, dt);
    const linAcc = applyAsymmetricAccelClamp(
      rawLinAcc,
      targetLinear,
      currentLinear,
      BODY_PID_BASE.linearAccelLimit,
    );
    const angAcc = applyAsymmetricAccelClamp(
      rawAngAcc,
      targetAngular,
      currentAngular,
      BODY_PID_BASE.angularAccelLimit,
    );
    out.linearAccel = linAcc;
    out.angularAccel = angAcc;
    out.linear = currentLinear + linAcc * dt;
    out.angular = currentAngular + angAcc * dt;
    return out;
  }

  /** Сбросить состояние интеграторов — при reset робота или смене режима. */
  reset(): void {
    this.linear.reset();
    this.angular.reset();
  }

  /**
   * Мягкий anti-windup при механическом упоре: гасит интегральную составляющую,
   * оставляя производное состояние и историю ошибки. Так derivative-kick на
   * сам момент удара сохраняется (energy удара корректна), но накопление
   * против неподвижного препятствия не происходит.
   */
  resetIntegralOnClamp(): void {
    this.linear.resetIntegral();
    this.angular.resetIntegral();
  }
}

export function makeRobotBodyPidStep(): RobotBodyPidStep {
  return { linear: 0, angular: 0, linearAccel: 0, angularAccel: 0 };
}

/**
 * Асимметричный clamp ускорения: разгон до полного `limit`, торможение —
 * только до `limit · accelCoastScale`. Сохраняет физическое поведение
 * `robotVelocityIntegrator` (тяжёлый корпус выбегает дольше, чем разгоняется).
 */
function applyAsymmetricAccelClamp(
  rawAcc: number,
  target: number,
  current: number,
  limit: number,
): number {
  const isDecel = Math.abs(target) < Math.abs(current);
  const effLimit = isDecel ? limit * BODY_PID_BASE.accelCoastScale : limit;
  return clamp(rawAcc, -effLimit, effLimit);
}

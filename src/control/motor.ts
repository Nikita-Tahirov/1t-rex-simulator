/**
 * Модель ходового мотора с редуктором для 1T-REX.
 *
 * Принимаем линейную аппроксимацию характеристики момента DC-привода:
 *   τ_motor(ω) = τ_stall * (1 − ω / ω_noload)         (для |ω| ≤ ω_noload)
 *
 * Регулирование через коэффициент скважности ШИМ duty ∈ [-1, +1]:
 *   τ_eff = duty * τ_motor(ω)
 *
 * После редуктора:
 *   τ_wheel = τ_eff * gearRatio * efficiency
 *   ω_wheel = ω / gearRatio
 *
 * Электрический ток (упрощённо, через постоянную момента):
 *   I = τ_motor / Kt    (Kt = τ_stall / I_stall)
 *
 * Тепловая модель — RC-цепочка первого порядка по I²·R потерям.
 *
 * Допущения (ВКР):
 *   • Линейная τ-ω характеристика (реально — насыщение, нелинейности)
 *   • Без учёта индуктивности обмотки (быстрая электромагнитная динамика)
 *   • Без учёта реактивной составляющей при ШИМ-коммутации
 *   • Постоянная Kt (реально — слабая зависимость от температуры)
 */

import { clamp } from '@/lib/math.ts';

export interface MotorParams {
  /** Момент при заклиненном роторе, Н·м (на валу мотора, до редуктора). */
  stallTorque: number;
  /** Частота вращения холостого хода, рад/с. */
  noLoadSpeed: number;
  /** Ток при заклиненном роторе, А. */
  stallCurrent: number;
  /** Передаточное число редуктора (>1 → понижающий). */
  gearRatio: number;
  /** КПД редуктора 0..1. */
  gearEfficiency: number;
  /** Сопротивление обмотки, Ом. */
  windingResistance: number;
  /** Тепловая ёмкость, Дж/К. */
  heatCapacity?: number;
  /** Коэффициент теплоотвода, Вт/К. */
  thermalConductance?: number;
  /** Температура окружающей среды, °C. */
  ambientTemperatureC?: number;
  /** Максимальный непрерывный ток (защита), А. */
  currentLimit?: number;
}

export interface MotorState {
  /** Угловая скорость на валу мотора (до редуктора), рад/с. */
  motorSpeed: number;
  /** Угловая скорость на выходе редуктора, рад/с. */
  wheelSpeed: number;
  /** Момент на выходе редуктора, Н·м. */
  wheelTorque: number;
  /** Ток обмотки, А. */
  current: number;
  /** Температура обмотки, °C. */
  temperatureC: number;
  /** ШИМ-скважность, [-1; 1]. */
  duty: number;
}

export class MotorModel {
  private readonly params: Required<MotorParams>;
  private temperatureC: number;
  private duty = 0;
  private lastCurrent = 0;
  private wheelTorque = 0;

  constructor(params: MotorParams) {
    this.params = {
      heatCapacity: 200,
      thermalConductance: 1.0,
      ambientTemperatureC: 22,
      currentLimit: params.stallCurrent * 0.6,
      ...params,
    } as Required<MotorParams>;
    this.temperatureC = this.params.ambientTemperatureC;
  }

  /**
   * Один шаг модели.
   * @param duty Скважность ШИМ ∈ [-1, +1]
   * @param wheelAngularSpeed Текущая угловая скорость колеса (на выходе редуктора), рад/с
   * @param dt Шаг времени, с
   */
  step(duty: number, wheelAngularSpeed: number, dt: number): MotorState {
    const d = clamp(duty, -1, 1);
    this.duty = d;

    // Перенос скорости на вал мотора
    const motorSpeed = wheelAngularSpeed * this.params.gearRatio;

    // Момент мотора в текущей точке кривой
    const speedRatio = clamp(motorSpeed / this.params.noLoadSpeed, -1, 1);
    const torqueAvailable =
      this.params.stallTorque * (1 - Math.abs(speedRatio)) * Math.sign(d || 1);

    // Эффективный момент с учётом скважности и направления
    let motorTorque = d * Math.abs(torqueAvailable);
    if (d * motorSpeed < 0) {
      // Регенеративное торможение — момент противоположен скорости, ограничен
      motorTorque = d * this.params.stallTorque;
    }

    // Ток через постоянную момента
    const kt = this.params.stallTorque / this.params.stallCurrent;
    let current = motorTorque / kt;

    // Защита по току
    const lim = this.params.currentLimit;
    if (Math.abs(current) > lim) {
      current = Math.sign(current) * lim;
      motorTorque = current * kt;
    }

    // Момент на выходе редуктора
    this.wheelTorque = motorTorque * this.params.gearRatio * this.params.gearEfficiency;
    this.lastCurrent = current;

    // Тепловая модель: I²·R потери
    const dissipated = current * current * this.params.windingResistance;
    const heatFlowOut =
      this.params.thermalConductance * (this.temperatureC - this.params.ambientTemperatureC);
    this.temperatureC += ((dissipated - heatFlowOut) * dt) / this.params.heatCapacity;

    return this.snapshot(motorSpeed, wheelAngularSpeed);
  }

  snapshot(motorSpeed = 0, wheelSpeed = 0): MotorState {
    return {
      motorSpeed,
      wheelSpeed,
      wheelTorque: this.wheelTorque,
      current: this.lastCurrent,
      temperatureC: this.temperatureC,
      duty: this.duty,
    };
  }

  /** Электрическая мощность, потребляемая от АКБ, Вт (V_bus × I). */
  electricPower(busVoltage: number): number {
    return Math.abs(this.lastCurrent) * busVoltage;
  }

  isOverheated(thresholdC = 90): boolean {
    return this.temperatureC > thresholdC;
  }
}

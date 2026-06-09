/**
 * Виртуальный квадратурный энкодер на ходовом колесе.
 *
 * Принимает истинную угловую скорость колеса, интегрирует угол с дискретизацией
 * по числу импульсов на оборот (PPR — pulses per revolution).
 *
 * Выходы:
 *   • totalCount — накопленное количество импульсов (со знаком)
 *   • measuredSpeed — оценка ω из дельты импульсов за dt
 *
 * Допущения:
 *   • Идеальный квадратурный декодер (нет ошибок направления)
 *   • Шум измерения — только за счёт квантования (2π/PPR радиан на тик)
 */

export interface EncoderParams {
  /** Импульсов на оборот колеса (квадратурно — после ×4 декодирования). */
  pulsesPerRevolution: number;
  /** Минимальное dt для оценки скорости — фильтр от деления на ноль, с. */
  minSpeedDt?: number;
}

export interface EncoderState {
  totalCount: number;
  totalAngle: number;
  measuredSpeed: number;
}

export class EncoderSensor {
  private readonly ppr: number;
  private readonly minSpeedDt: number;
  private accumulatedAngle = 0;
  private totalCount = 0;
  private lastCount = 0;
  private lastSpeed = 0;

  constructor(params: EncoderParams) {
    if (params.pulsesPerRevolution <= 0) throw new RangeError('PPR must be > 0');
    this.ppr = params.pulsesPerRevolution;
    this.minSpeedDt = params.minSpeedDt ?? 1e-4;
  }

  /**
   * @param trueAngularSpeed Истинная угловая скорость колеса, рад/с
   * @param dt Шаг времени, с
   */
  step(trueAngularSpeed: number, dt: number): EncoderState {
    if (dt < 0) throw new RangeError('dt must be ≥ 0');
    this.accumulatedAngle += trueAngularSpeed * dt;
    // Преобразование в импульсы (целое число)
    this.totalCount = Math.trunc((this.accumulatedAngle * this.ppr) / (2 * Math.PI));
    if (dt >= this.minSpeedDt) {
      const dCount = this.totalCount - this.lastCount;
      const dAngle = (dCount * 2 * Math.PI) / this.ppr;
      this.lastSpeed = dAngle / dt;
      this.lastCount = this.totalCount;
    }
    return this.snapshot();
  }

  snapshot(): EncoderState {
    return {
      totalCount: this.totalCount,
      totalAngle: (this.totalCount * 2 * Math.PI) / this.ppr,
      measuredSpeed: this.lastSpeed,
    };
  }

  reset(): void {
    this.accumulatedAngle = 0;
    this.totalCount = 0;
    this.lastCount = 0;
    this.lastSpeed = 0;
  }
}

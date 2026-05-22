/**
 * Комплементарный фильтр оценки крена/тангажа из 6-осевого IMU
 * (акселерометр + гироскоп).
 *
 * Эталонная реализация: совпадает с тем, что развёрнуто в практике на МИК32 «Амур»
 * (см. отчёт по производственной практике, раздел 3.3).
 *
 * Идея:
 *   • Гироскоп — точный по углу на коротких интервалах, но дрифтит из-за bias.
 *   • Акселерометр — отдаёт абсолютное направление силы тяжести, но шумит при манёврах.
 *   • Фильтр: angle = α · (angle_prev + ω · dt) + (1 − α) · angle_acc
 *     где α ≈ τ / (τ + dt), τ — постоянная времени фильтра (~0.5..2 с)
 *
 * Yaw (рыскание) этим фильтром НЕ восстанавливается — для него нужен магнитометр
 * либо фильтр Маджвика. В рамках ВКР сравним с MadgwickFilter в отдельном модуле.
 */

export interface ComplementaryFilterParams {
  /** Постоянная времени фильтра, с. */
  tau: number;
}

export interface OrientationEstimate {
  /** Крен (вокруг оси X), рад. */
  roll: number;
  /** Тангаж (вокруг оси Y), рад. */
  pitch: number;
}

export interface IMUSample {
  /** Линейные ускорения, м/с². */
  ax: number;
  ay: number;
  az: number;
  /** Угловые скорости, рад/с. */
  gx: number;
  gy: number;
  gz: number;
}

export class ComplementaryFilter {
  private readonly tau: number;
  private roll = 0;
  private pitch = 0;
  private initialised = false;

  constructor(params: ComplementaryFilterParams) {
    if (params.tau <= 0) throw new RangeError('tau must be > 0');
    this.tau = params.tau;
  }

  /**
   * Один шаг.
   * @param sample Сырые данные IMU
   * @param dt Шаг времени, с
   */
  update(sample: IMUSample, dt: number): OrientationEstimate {
    if (dt <= 0) return { roll: this.roll, pitch: this.pitch };

    // Углы из акселерометра (предполагаем, что робот не в свободном падении)
    const accelMagnitude = Math.hypot(sample.ax, sample.ay, sample.az);
    let rollAcc = this.roll;
    let pitchAcc = this.pitch;
    if (accelMagnitude > 1e-3) {
      rollAcc = Math.atan2(sample.ay, sample.az);
      pitchAcc = Math.atan2(-sample.ax, Math.hypot(sample.ay, sample.az));
    }

    if (!this.initialised) {
      this.roll = rollAcc;
      this.pitch = pitchAcc;
      this.initialised = true;
      return { roll: this.roll, pitch: this.pitch };
    }

    const alpha = this.tau / (this.tau + dt);

    const rollGyro = this.roll + sample.gx * dt;
    const pitchGyro = this.pitch + sample.gy * dt;

    this.roll = alpha * rollGyro + (1 - alpha) * rollAcc;
    this.pitch = alpha * pitchGyro + (1 - alpha) * pitchAcc;

    return { roll: this.roll, pitch: this.pitch };
  }

  reset(): void {
    this.roll = 0;
    this.pitch = 0;
    this.initialised = false;
  }

  snapshot(): OrientationEstimate {
    return { roll: this.roll, pitch: this.pitch };
  }
}

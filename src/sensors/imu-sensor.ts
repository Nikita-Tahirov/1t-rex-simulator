/**
 * Виртуальный 6-осевой IMU (акселерометр + гироскоп) для симулятора.
 *
 * Принимает «истинные» ω и a из физического движка, добавляет:
 *   • Гауссовский шум (белый) с настраиваемой σ для каждого канала
 *   • Bias-дрифт (медленный random walk) — имитация термического дрифта гироскопа
 *   • Квантование 16-бит (диапазон ±g_max / ±ω_max → ±32768)
 *
 * Эталонная имитация типичного MEMS-датчика (например, MPU-6500).
 */

import type { IMUSample } from './complementary-filter.ts';

export interface IMUNoiseSpec {
  /** σ ускорения, м/с². */
  accelStd: number;
  /** σ угловой скорости, рад/с. */
  gyroStd: number;
  /** Скорость дрифта bias-а гироскопа, рад/с/√с (random walk). */
  gyroBiasRandomWalk: number;
  /** Полный диапазон акселерометра ±, м/с² (для квантования). */
  accelRange: number;
  /** Полный диапазон гироскопа ±, рад/с (для квантования). */
  gyroRange: number;
  /** Семя ГПСЧ для воспроизводимых тестов. */
  seed?: number;
}

export interface IMUTrueSample {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

/** Простой детерминированный ГПСЧ (Mulberry32). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Box-Muller преобразование U(0,1)² → N(0,1). */
function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function quantise(x: number, range: number): number {
  const clamped = Math.max(-range, Math.min(range, x));
  const q = Math.round((clamped / range) * 32768) / 32768;
  return q * range;
}

export class IMUSensor {
  private readonly spec: IMUNoiseSpec;
  private readonly rng: () => number;
  private biasGx = 0;
  private biasGy = 0;
  private biasGz = 0;

  constructor(spec: IMUNoiseSpec) {
    this.spec = spec;
    this.rng = makeRng(spec.seed ?? 0xc0ffee);
  }

  sample(truth: IMUTrueSample, dt: number): IMUSample {
    const sqrtDt = Math.sqrt(Math.max(dt, 0));
    this.biasGx += this.spec.gyroBiasRandomWalk * sqrtDt * gaussian(this.rng);
    this.biasGy += this.spec.gyroBiasRandomWalk * sqrtDt * gaussian(this.rng);
    this.biasGz += this.spec.gyroBiasRandomWalk * sqrtDt * gaussian(this.rng);

    return {
      ax: quantise(truth.ax + this.spec.accelStd * gaussian(this.rng), this.spec.accelRange),
      ay: quantise(truth.ay + this.spec.accelStd * gaussian(this.rng), this.spec.accelRange),
      az: quantise(truth.az + this.spec.accelStd * gaussian(this.rng), this.spec.accelRange),
      gx: quantise(
        truth.gx + this.biasGx + this.spec.gyroStd * gaussian(this.rng),
        this.spec.gyroRange,
      ),
      gy: quantise(
        truth.gy + this.biasGy + this.spec.gyroStd * gaussian(this.rng),
        this.spec.gyroRange,
      ),
      gz: quantise(
        truth.gz + this.biasGz + this.spec.gyroStd * gaussian(this.rng),
        this.spec.gyroRange,
      ),
    };
  }

  biasSnapshot(): { gx: number; gy: number; gz: number } {
    return { gx: this.biasGx, gy: this.biasGy, gz: this.biasGz };
  }

  resetBias(): void {
    this.biasGx = 0;
    this.biasGy = 0;
    this.biasGz = 0;
  }
}

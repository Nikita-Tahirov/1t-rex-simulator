import { describe, expect, it } from 'vitest';
import { EncoderSensor } from './encoder-sensor.ts';

describe('EncoderSensor', () => {
  it('один полный оборот → ppr импульсов', () => {
    const e = new EncoderSensor({ pulsesPerRevolution: 1024 });
    e.step(2 * Math.PI, 1); // ω · dt = 2π рад
    expect(e.snapshot().totalCount).toBe(1024);
  });

  it('measuredSpeed ≈ trueSpeed в стационарном режиме', () => {
    const e = new EncoderSensor({ pulsesPerRevolution: 4096 });
    for (let i = 0; i < 100; i++) e.step(10, 0.01);
    expect(e.snapshot().measuredSpeed).toBeCloseTo(10, 0);
  });

  it('квантование при низком PPR', () => {
    const e = new EncoderSensor({ pulsesPerRevolution: 8 });
    e.step(0.1, 0.01); // очень малое перемещение
    // 0.1 * 0.01 = 0.001 рад → 0.001 * 8 / (2π) ≈ 0.00127 импульса → trunc = 0
    expect(e.snapshot().totalCount).toBe(0);
  });

  it('реверс направления → отрицательный счёт', () => {
    const e = new EncoderSensor({ pulsesPerRevolution: 1024 });
    e.step(-2 * Math.PI, 1);
    expect(e.snapshot().totalCount).toBe(-1024);
  });

  it('reset обнуляет состояние', () => {
    const e = new EncoderSensor({ pulsesPerRevolution: 1024 });
    e.step(10, 0.5);
    e.reset();
    expect(e.snapshot()).toEqual({ totalCount: 0, totalAngle: 0, measuredSpeed: 0 });
  });

  it('PPR ≤ 0 — ошибка', () => {
    expect(() => new EncoderSensor({ pulsesPerRevolution: 0 })).toThrow();
  });
});

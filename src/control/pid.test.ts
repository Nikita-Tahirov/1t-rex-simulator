import { describe, expect, it } from 'vitest';
import { PIDController } from './pid.ts';

describe('PIDController', () => {
  it('пропорциональная составляющая отрабатывает первый же шаг', () => {
    const pid = new PIDController({ kp: 2, ki: 0, kd: 0 });
    expect(pid.update(10, 0, 0.01)).toBeCloseTo(20);
  });

  it('интегральная составляющая накапливается при ненулевой ошибке', () => {
    const pid = new PIDController({ kp: 0, ki: 1, kd: 0 });
    pid.update(1, 0, 1);
    pid.update(1, 0, 1);
    pid.update(1, 0, 1);
    expect(pid.snapshot().integral).toBeCloseTo(3);
  });

  it('зажимает выход в outputMin/outputMax', () => {
    const pid = new PIDController({ kp: 100, ki: 0, kd: 0, outputMin: -1, outputMax: 1 });
    expect(pid.update(10, 0, 0.01)).toBeCloseTo(1);
    expect(pid.update(-10, 0, 0.01)).toBeCloseTo(-1);
  });

  it('anti-windup замораживает интегратор при насыщении выхода', () => {
    const pid = new PIDController({ kp: 0, ki: 10, kd: 0, outputMin: -1, outputMax: 1 });
    for (let k = 0; k < 100; k++) pid.update(1, 0, 0.01);
    const trapped = pid.snapshot().integral;
    expect(trapped).toBeLessThanOrEqual(1.0001);
    expect(trapped).toBeGreaterThan(0);
  });

  it('reset обнуляет состояние', () => {
    const pid = new PIDController({ kp: 1, ki: 1, kd: 0 });
    pid.update(5, 0, 0.1);
    pid.update(5, 0, 0.1);
    pid.reset();
    expect(pid.snapshot()).toEqual({
      integral: 0,
      prevError: 0,
      prevDerivative: 0,
      prevOutput: 0,
    });
  });

  it('сходится к setpoint в замкнутой петле первого порядка', () => {
    // Объект: y[k] = y[k-1] + u[k-1] * dt (интегратор, эмуляция момента→скорости)
    const pid = new PIDController({
      kp: 5,
      ki: 2,
      kd: 0.05,
      derivativeFilterTau: 0.02,
      outputMin: -10,
      outputMax: 10,
    });
    let y = 0;
    const dt = 0.01;
    for (let k = 0; k < 2000; k++) {
      const u = pid.update(1.0, y, dt);
      y += u * dt;
    }
    expect(y).toBeCloseTo(1.0, 1);
  });

  it('setGains(ki=0) сбрасывает накопленный интегратор — выключение I действительно выключает', () => {
    const pid = new PIDController({ kp: 0, ki: 5, kd: 0 });
    for (let k = 0; k < 30; k++) pid.update(1, 0, 0.1);
    expect(pid.snapshot().integral).toBeGreaterThan(0);
    pid.setGains(0, 0, 0);
    // После «выключения» PID должен выдавать 0 даже при ненулевой ошибке.
    expect(pid.update(1, 0, 0.1)).toBeCloseTo(0);
    expect(pid.snapshot().integral).toBe(0);
  });

  it('фильтр производной сглаживает скачок', () => {
    const fast = new PIDController({ kp: 0, ki: 0, kd: 1, derivativeFilterTau: 0 });
    const filtered = new PIDController({ kp: 0, ki: 0, kd: 1, derivativeFilterTau: 0.1 });
    fast.update(0, 0, 0.01);
    filtered.update(0, 0, 0.01);
    const dFast = fast.update(1, 0, 0.01);
    const dFiltered = filtered.update(1, 0, 0.01);
    expect(Math.abs(dFiltered)).toBeLessThan(Math.abs(dFast));
  });
});

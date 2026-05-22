import { describe, expect, it } from 'vitest';
import { bodyToWheels, tankCommandToBody, wheelsToBody } from './kinematics.ts';

const geom = { wheelbase: 0.6, trackWidth: 0.83, wheelRadius: 0.075 };

describe('skid-steer kinematics', () => {
  it('одинаковые ω всех колёс → чистая поступательная скорость', () => {
    const v = wheelsToBody({ frontLeft: 10, frontRight: 10, rearLeft: 10, rearRight: 10 }, geom);
    expect(v.linear).toBeCloseTo(10 * 0.075);
    expect(v.angular).toBeCloseTo(0);
  });

  it('левая = -правая → чистый разворот на месте', () => {
    const v = wheelsToBody({ frontLeft: -5, frontRight: 5, rearLeft: -5, rearRight: 5 }, geom);
    expect(v.linear).toBeCloseTo(0);
    expect(v.angular).toBeGreaterThan(0);
  });

  it('обратная задача — обратимость', () => {
    const target = { linear: 1.5, angular: 0.4 };
    const wheels = bodyToWheels(target, geom);
    const recovered = wheelsToBody(wheels, geom);
    expect(recovered.linear).toBeCloseTo(target.linear, 6);
    expect(recovered.angular).toBeCloseTo(target.angular, 6);
  });

  it('tankCommand: полный газ + ноль поворота', () => {
    const v = tankCommandToBody(1, 0, 6.94, 3);
    expect(v.linear).toBeCloseTo(6.94);
    expect(v.angular).toBeCloseTo(0);
  });

  it('tankCommand: правый стик влияет на ψ̇', () => {
    const v = tankCommandToBody(0, 1, 7, 3);
    expect(v.angular).toBeLessThan(0); // правый поворот → отрицательная ψ̇ (по часовой)
  });

  it('clamp за пределами [-1,1]', () => {
    const v = tankCommandToBody(2, -2, 10, 5);
    expect(v.linear).toBeCloseTo(10);
    expect(v.angular).toBeCloseTo(5);
  });
});

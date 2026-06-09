import { describe, expect, it } from 'vitest';
import { clampToArena, closingSpeed, separateFromObstacles, stepArcade } from './battleArcade.ts';

const PARAMS = { maxSpeed: 6, maxYawRate: 3, accelTau: 0.2, driveScale: 1 };

describe('stepArcade', () => {
  it('едет вперёд по +X при yaw=0', () => {
    const next = stepArcade(
      { x: 0, z: 0, yaw: 0, speed: 6 },
      { throttle: 1, turn: 0, brake: 0 },
      PARAMS,
      0.1,
    );
    expect(next.x).toBeGreaterThan(0);
    expect(Math.abs(next.z)).toBeLessThan(1e-9);
  });

  it('поворот вправо (turn>0) увеличивает yaw', () => {
    const next = stepArcade(
      { x: 0, z: 0, yaw: 0, speed: 0 },
      { throttle: 0, turn: 1, brake: 0 },
      PARAMS,
      0.1,
    );
    expect(next.yaw).toBeGreaterThan(0);
  });

  it('повреждения снижают целевую скорость через driveScale', () => {
    const healthy = stepArcade(
      { x: 0, z: 0, yaw: 0, speed: 0 },
      { throttle: 1, turn: 0, brake: 0 },
      PARAMS,
      0.1,
    );
    const damaged = stepArcade(
      { x: 0, z: 0, yaw: 0, speed: 0 },
      { throttle: 1, turn: 0, brake: 0 },
      { ...PARAMS, driveScale: 0.45 },
      0.1,
    );
    expect(damaged.speed).toBeLessThan(healthy.speed);
  });

  it('тормоз обнуляет цель скорости', () => {
    const next = stepArcade(
      { x: 0, z: 0, yaw: 0, speed: 6 },
      { throttle: 1, turn: 0, brake: 1 },
      PARAMS,
      0.1,
    );
    expect(next.speed).toBeLessThan(6);
  });
});

describe('clampToArena', () => {
  it('держит робота внутри квадрата и сигналит об ударе о стену', () => {
    expect(clampToArena(20, 0, 14.5)).toEqual({ x: 14.5, z: 0, hit: true });
    expect(clampToArena(3, -4, 14.5)).toEqual({ x: 3, z: -4, hit: false });
  });
});

describe('separateFromObstacles', () => {
  it('выталкивает из пересечения с соперником', () => {
    const result = separateFromObstacles(0, 0, [{ x: 0.5, z: 0 }], 1);
    expect(result.x).toBeLessThan(0);
    expect(result.hitIndex).toBe(0);
  });

  it('не трогает, если соперник далеко', () => {
    const result = separateFromObstacles(0, 0, [{ x: 5, z: 0 }], 1);
    expect(result).toEqual({ x: 0, z: 0, hitIndex: -1 });
  });

  it('разводит точно совпавшие центры', () => {
    const result = separateFromObstacles(0, 0, [{ x: 0, z: 0 }], 1);
    expect(Math.hypot(result.x, result.z)).toBeGreaterThan(0);
    expect(result.hitIndex).toBe(0);
  });
});

describe('closingSpeed', () => {
  it('лобовое сближение даёт сумму скоростей и симметрично', () => {
    const a = { x: -1, z: 0, yaw: 0, speed: 4 }; // едет в +X
    const b = { x: 1, z: 0, yaw: Math.PI, speed: 3 }; // едет в -X (навстречу)
    const ab = closingSpeed(a, b);
    const ba = closingSpeed(b, a);
    expect(ab).toBeCloseTo(7, 5);
    expect(ba).toBeCloseTo(7, 5);
  });

  it('расходящиеся роботы не сближаются', () => {
    const a = { x: 0, z: 0, yaw: Math.PI, speed: 4 }; // едет в -X (от b)
    const b = { x: 1, z: 0, yaw: 0, speed: 3 }; // едет в +X (от a)
    expect(closingSpeed(a, b)).toBe(0);
  });
});

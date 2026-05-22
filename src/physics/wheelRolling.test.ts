import { describe, expect, it } from 'vitest';
import { advanceRollingWheelAngles, rollingWheelSpeedsFromBodyVelocity } from './wheelRolling.ts';

const geom = { wheelbase: 0.6, trackWidth: 0.8, wheelRadius: 0.1 };

describe('wheel rolling visual velocity', () => {
  it('останавливает колёса, когда шасси реально не меняет позу', () => {
    expect(rollingWheelSpeedsFromBodyVelocity({ linear: 0, angular: 0 }, geom)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(rollingWheelSpeedsFromBodyVelocity({ linear: 0.001, angular: 0.001 }, geom)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('вращает все колёса одинаково при поступательном движении', () => {
    expect(rollingWheelSpeedsFromBodyVelocity({ linear: 1, angular: 0 }, geom)).toEqual([
      10, 10, 10, 10,
    ]);
  });

  it('вращает стороны встречно при развороте на месте', () => {
    expect(rollingWheelSpeedsFromBodyVelocity({ linear: 0, angular: 1 }, geom)).toEqual([
      -4, 4, -4, 4,
    ]);
  });

  it('не меняет визуальный угол неподвижного колеса', () => {
    const angles: [number, number, number, number] = [1, 2, 3, 4];
    advanceRollingWheelAngles(angles, [0, 0, 0, 0], 0.5);
    expect(angles).toEqual([1, 2, 3, 4]);
  });
});

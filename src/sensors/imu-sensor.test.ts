import { describe, expect, it } from 'vitest';
import { IMUSensor } from './imu-sensor.ts';

const cleanSpec = {
  accelStd: 0,
  gyroStd: 0,
  gyroBiasRandomWalk: 0,
  accelRange: 16 * 9.81,
  gyroRange: 35,
  seed: 42,
};

describe('IMUSensor', () => {
  it('без шума и без bias — выход ≈ истине (с учётом квантования)', () => {
    const imu = new IMUSensor(cleanSpec);
    const out = imu.sample({ ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0 }, 0.01);
    expect(out.az).toBeCloseTo(9.81, 1);
    expect(out.gx).toBeCloseTo(0, 5);
  });

  it('гироскоп шумит, среднее ~0', () => {
    const imu = new IMUSensor({ ...cleanSpec, gyroStd: 0.05 });
    let sum = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const s = imu.sample({ ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0 }, 0.001);
      sum += s.gx;
    }
    expect(Math.abs(sum / N)).toBeLessThan(0.01);
  });

  it('квантование 16-бит — sample не выходит за диапазон', () => {
    const imu = new IMUSensor({ ...cleanSpec, gyroRange: 5 });
    const s = imu.sample({ ax: 0, ay: 0, az: 9.81, gx: 100, gy: 0, gz: 0 }, 0.01);
    expect(s.gx).toBeLessThanOrEqual(5.001);
  });

  it('bias-дрифт накапливается со временем', () => {
    const imu = new IMUSensor({ ...cleanSpec, gyroBiasRandomWalk: 0.01, seed: 1 });
    for (let i = 0; i < 1000; i++) {
      imu.sample({ ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0 }, 0.01);
    }
    const b = imu.biasSnapshot();
    expect(Math.abs(b.gx) + Math.abs(b.gy) + Math.abs(b.gz)).toBeGreaterThan(0);
  });

  it('одинаковый seed → детерминированный выход', () => {
    const a = new IMUSensor({ ...cleanSpec, gyroStd: 0.1, seed: 7 });
    const b = new IMUSensor({ ...cleanSpec, gyroStd: 0.1, seed: 7 });
    const sa = a.sample({ ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0 }, 0.01);
    const sb = b.sample({ ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0 }, 0.01);
    expect(sa).toEqual(sb);
  });
});

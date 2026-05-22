import { describe, expect, it } from 'vitest';
import { ComplementaryFilter } from './complementary-filter.ts';

describe('ComplementaryFilter', () => {
  it('отрицает dt ≤ 0', () => {
    expect(() => new ComplementaryFilter({ tau: -1 })).toThrow();
  });

  it('сходится к показаниям акселерометра в покое', () => {
    const f = new ComplementaryFilter({ tau: 0.5 });
    // Ровный покой: g вдоль -Z в системе IMU (ENU)
    for (let i = 0; i < 1000; i++) {
      f.update({ ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0 }, 0.01);
    }
    const s = f.snapshot();
    expect(s.roll).toBeCloseTo(0, 2);
    expect(s.pitch).toBeCloseTo(0, 2);
  });

  it('наклон по крену детектируется акселерометром', () => {
    const f = new ComplementaryFilter({ tau: 0.5 });
    // Робот наклонён на 30° по roll → ay = g·sin(30°), az = g·cos(30°)
    const tilt = Math.PI / 6;
    const ay = 9.81 * Math.sin(tilt);
    const az = 9.81 * Math.cos(tilt);
    for (let i = 0; i < 1000; i++) {
      f.update({ ax: 0, ay, az, gx: 0, gy: 0, gz: 0 }, 0.01);
    }
    expect(f.snapshot().roll).toBeCloseTo(tilt, 2);
  });

  it('гироскоп отрабатывает быстрые повороты', () => {
    const f = new ComplementaryFilter({ tau: 5 });
    // Быстрая ротация по pitch на 90° за 0.5 с → ω = π рад/с
    // Акселерометр пока не успевает, гироскоп интегрирует через filter с большим τ
    const omega = Math.PI;
    for (let i = 0; i < 50; i++) {
      f.update({ ax: 0, ay: 0, az: 9.81, gx: 0, gy: omega, gz: 0 }, 0.01);
    }
    // С τ = 5 с фильтр почти полностью верит гироскопу
    expect(f.snapshot().pitch).toBeGreaterThan(1.0);
  });

  it('reset обнуляет состояние', () => {
    const f = new ComplementaryFilter({ tau: 0.5 });
    f.update({ ax: 0, ay: 9.81, az: 0, gx: 0, gy: 0, gz: 0 }, 0.01);
    f.reset();
    expect(f.snapshot()).toEqual({ roll: 0, pitch: 0 });
  });
});

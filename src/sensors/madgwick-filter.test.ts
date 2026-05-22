import { describe, expect, it } from 'vitest';
import { MadgwickFilter } from './madgwick-filter.ts';

describe('MadgwickFilter', () => {
  it('инициализируется единичным кватернионом', () => {
    const f = new MadgwickFilter({ beta: 0.1 });
    expect(f.toEuler()).toEqual({ roll: 0, pitch: 0, yaw: 0 });
  });

  it('сходится к нулевому крену в покое', () => {
    const f = new MadgwickFilter({ beta: 0.1 });
    for (let i = 0; i < 2000; i++) {
      f.update({ ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0 }, 0.01);
    }
    const e = f.toEuler();
    expect(Math.abs(e.roll)).toBeLessThan(0.05);
    expect(Math.abs(e.pitch)).toBeLessThan(0.05);
  });

  it('детектирует крен по акселерометру', () => {
    const f = new MadgwickFilter({ beta: 0.1 });
    const tilt = Math.PI / 6;
    const ay = 9.81 * Math.sin(tilt);
    const az = 9.81 * Math.cos(tilt);
    for (let i = 0; i < 3000; i++) {
      f.update({ ax: 0, ay, az, gx: 0, gy: 0, gz: 0 }, 0.01);
    }
    expect(f.toEuler().roll).toBeCloseTo(tilt, 1);
  });

  it('интегрирует yaw по гироскопу (отсутствует в комплементарном)', () => {
    const f = new MadgwickFilter({ beta: 0.05 });
    // Поворот по yaw на 90°, ω = π/2 рад/с в течение 1 с
    for (let i = 0; i < 100; i++) {
      f.update({ ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: Math.PI / 2 }, 0.01);
    }
    expect(Math.abs(f.toEuler().yaw)).toBeGreaterThan(1.0);
  });

  it('reset возвращает в нулевое состояние', () => {
    const f = new MadgwickFilter({ beta: 0.1 });
    f.update({ ax: 0, ay: 9.81, az: 0, gx: 0, gy: 0, gz: 0 }, 0.5);
    f.reset();
    expect(f.toEuler()).toEqual({ roll: 0, pitch: 0, yaw: 0 });
  });

  it('β < 0 — ошибка', () => {
    expect(() => new MadgwickFilter({ beta: -0.1 })).toThrow();
  });
});

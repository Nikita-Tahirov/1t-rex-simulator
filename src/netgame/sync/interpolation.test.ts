import { describe, expect, it } from 'vitest';
import { pushSnapshot, type SampledPose, type Snapshot, sampleSnapshots } from './interpolation.ts';

function snap(t: number, x: number, yaw = 0): Snapshot {
  return { t, x, z: 0, yaw, speed: 1, spinnerRpm: 0, health: 1000, alive: true };
}

function emptyPose(): SampledPose {
  return { x: 0, z: 0, yaw: 0, speed: 0, spinnerRpm: 0, health: 0, alive: false };
}

describe('pushSnapshot', () => {
  it('игнорирует устаревшие/дублирующие снимки', () => {
    const buffer: Snapshot[] = [];
    pushSnapshot(buffer, snap(100, 1));
    pushSnapshot(buffer, snap(90, 2)); // старее — игнор
    pushSnapshot(buffer, snap(100, 3)); // дубль t — игнор
    pushSnapshot(buffer, snap(110, 4));
    expect(buffer.map((s) => s.x)).toEqual([1, 4]);
  });
});

describe('sampleSnapshots', () => {
  it('линейно интерполирует между двумя снимками', () => {
    const buffer = [snap(0, 0), snap(100, 10)];
    const out = emptyPose();
    expect(sampleSnapshots(buffer, 50, out)).toBe(true);
    expect(out.x).toBeCloseTo(5, 5);
  });

  it('держит старейший до начала и новейший после конца (без экстраполяции)', () => {
    const buffer = [snap(100, 1), snap(200, 9)];
    const out = emptyPose();
    sampleSnapshots(buffer, 50, out);
    expect(out.x).toBe(1);
    sampleSnapshots(buffer, 999, out);
    expect(out.x).toBe(9);
  });

  it('экстраполирует позу за новейшим снимком по скорости/курсу (окно), затем замирает', () => {
    // speed=1 м/с, yaw=0 → +x. Снимок в t=100, x=5.
    const buffer = [snap(0, 0), snap(100, 5)];
    const out = emptyPose();
    // Через 50 мс: x ≈ 5 + 1*0.05 = 5.05.
    sampleSnapshots(buffer, 150, out, 200);
    expect(out.x).toBeCloseTo(5.05, 3);
    // За пределами окна экстраполяции (200 мс) дальше не уезжает.
    sampleSnapshots(buffer, 1000, out, 200);
    expect(out.x).toBeCloseTo(5 + 1 * 0.2, 3);
  });

  it('не экстраполирует мёртвый призрак', () => {
    const dead = [{ ...snap(100, 5), alive: false }];
    const out = emptyPose();
    sampleSnapshots(dead, 400, out, 200);
    expect(out.x).toBe(5);
  });

  it('интерполирует yaw кратчайшим углом через ±π', () => {
    const buffer = [snap(0, 0, 3.0), snap(100, 0, -3.0)];
    const out = emptyPose();
    sampleSnapshots(buffer, 50, out);
    // кратчайший путь через π, не через 0 → |yaw| близко к π, не к 0
    expect(Math.abs(out.yaw)).toBeGreaterThan(3.0);
  });

  it('возвращает false на пустом буфере', () => {
    expect(sampleSnapshots([], 0, emptyPose())).toBe(false);
  });
});

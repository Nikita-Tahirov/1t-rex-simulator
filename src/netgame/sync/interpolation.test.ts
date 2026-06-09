import { describe, expect, it } from 'vitest';
import { pushSnapshot, type SampledPose, type Snapshot, sampleSnapshots } from './interpolation.ts';

function snap(t: number, x: number, yaw = 0): Snapshot {
  return { t, x, z: 0, yaw, speed: 1, health: 1000, alive: true };
}

function emptyPose(): SampledPose {
  return { x: 0, z: 0, yaw: 0, speed: 0, health: 0, alive: false };
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

  it('держит старейший до начала и новейший после конца', () => {
    const buffer = [snap(100, 1), snap(200, 9)];
    const out = emptyPose();
    sampleSnapshots(buffer, 50, out);
    expect(out.x).toBe(1);
    sampleSnapshots(buffer, 999, out);
    expect(out.x).toBe(9);
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

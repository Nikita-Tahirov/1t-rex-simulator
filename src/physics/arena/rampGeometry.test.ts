import { describe, expect, it } from 'vitest';
import {
  BRIDGE_RAMPS,
  MAX_RAMP_SLOPE_DEG,
  SECTOR_ENTRY_RAMP_HEIGHT,
  SECTOR_ENTRY_RAMPS,
} from './arenaData.ts';
import { createRampVertices, rampSlopeDeg } from './rampGeometry.ts';

describe('arena ramp geometry', () => {
  it('creates a wedge with a zero-height toe and one high edge', () => {
    const vertices = createRampVertices([0.58, 1.8, SECTOR_ENTRY_RAMP_HEIGHT]);
    const points = Array.from({ length: vertices.length / 3 }, (_, i) => ({
      x: vertices[i * 3]!,
      y: vertices[i * 3 + 1]!,
    }));

    const lowX = Math.min(...points.map((p) => p.x));
    const highX = Math.max(...points.map((p) => p.x));
    const lowEdge = points.filter((p) => p.x === lowX);
    const highEdge = points.filter((p) => p.x === highX);

    expect(lowEdge.every((p) => p.y === 0)).toBe(true);
    expect(highEdge.some((p) => Math.abs(p.y - SECTOR_ENTRY_RAMP_HEIGHT) < 1e-6)).toBe(true);
  });

  it('keeps all A-D entry and bridge ramps at or below the target slope', () => {
    for (const ramp of [...SECTOR_ENTRY_RAMPS, ...BRIDGE_RAMPS]) {
      expect(rampSlopeDeg(ramp.size)).toBeLessThanOrEqual(MAX_RAMP_SLOPE_DEG);
    }
  });

  it('provides at least one sector-entry ramp for every training sector', () => {
    const zones = new Set(SECTOR_ENTRY_RAMPS.map((ramp) => ramp.zone));
    expect(zones).toEqual(new Set(['A', 'B', 'C', 'D']));
  });
});

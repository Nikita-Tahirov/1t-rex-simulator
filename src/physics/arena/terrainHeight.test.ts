import { describe, expect, it } from 'vitest';
import {
  BRIDGE_CENTER_Z,
  BRIDGE_DECK_EAST_X,
  BRIDGE_DECK_TOP_Y,
  BRIDGE_DECK_WEST_X,
  BRIDGE_LANDING_EAST_X,
  BRIDGE_LANDING_WEST_X,
  BRIDGE_RAMP_HEIGHT,
  BRIDGE_RAMP_LENGTH,
  BRIDGE_RAMPS,
  SECTOR_ENTRY_RAMPS,
  SECTOR_PAD_TOP_Y,
} from './arenaData.ts';
import { rampSurfaceHeightAt, terrainHeightAt } from './terrainHeight.ts';
import { ZONE_CENTERS } from './zoneLayout.ts';

describe('arena terrain height profile', () => {
  it('maps A-D platform centers to their drivable top height', () => {
    expect(terrainHeightAt(ZONE_CENTERS.A.x, ZONE_CENTERS.A.z)).toBe(SECTOR_PAD_TOP_Y);
    expect(terrainHeightAt(ZONE_CENTERS.B.x, ZONE_CENTERS.B.z)).toBe(SECTOR_PAD_TOP_Y);
    expect(terrainHeightAt(ZONE_CENTERS.C.x, ZONE_CENTERS.C.z)).toBe(SECTOR_PAD_TOP_Y);
    expect(terrainHeightAt(ZONE_CENTERS.D.x, ZONE_CENTERS.D.z)).toBe(BRIDGE_DECK_TOP_Y);
  });

  it('keeps the obstacle-avoidance slalom corridor free of sector-entry geometry', () => {
    expect(terrainHeightAt(2.25, -1.55)).toBe(0);
  });

  it('raises sector entry ramps from floor to pad height', () => {
    for (const ramp of SECTOR_ENTRY_RAMPS) {
      const [length, , height] = ramp.size;
      const [centerX, baseY, centerZ] = ramp.position;
      const [dirX, dirZ] = directionVector(ramp.direction);

      const low = rampSurfaceHeightAt(
        ramp,
        centerX - dirX * (length / 2),
        centerZ - dirZ * (length / 2),
      );
      const high = rampSurfaceHeightAt(
        ramp,
        centerX + dirX * (length / 2),
        centerZ + dirZ * (length / 2),
      );

      expect(low).toBeCloseTo(baseY, 6);
      expect(high).toBeCloseTo(baseY + height, 6);
      expect(high).toBeCloseTo(SECTOR_PAD_TOP_Y, 6);
    }
  });

  it('raises bridge ramps from landing pad height to deck height', () => {
    for (const ramp of BRIDGE_RAMPS) {
      const [length, , height] = ramp.size;
      const [centerX, baseY, centerZ] = ramp.position;
      const [dirX, dirZ] = directionVector(ramp.direction);

      const low = rampSurfaceHeightAt(
        ramp,
        centerX - dirX * (length / 2),
        centerZ - dirZ * (length / 2),
      );
      const high = rampSurfaceHeightAt(
        ramp,
        centerX + dirX * (length / 2),
        centerZ + dirZ * (length / 2),
      );

      expect(low).toBeCloseTo(SECTOR_PAD_TOP_Y, 6);
      expect(high).toBeCloseTo(baseY + height, 6);
      expect(high).toBeCloseTo(BRIDGE_DECK_TOP_Y, 6);
    }
  });

  it('aligns bridge ramp high edges with the deck collider edge without a vertical lip', () => {
    for (const ramp of BRIDGE_RAMPS) {
      const [length] = ramp.size;
      const [centerX, , centerZ] = ramp.position;
      const [dirX, dirZ] = directionVector(ramp.direction);
      const deckEdgeX = ramp.direction === 'posX' ? BRIDGE_DECK_WEST_X : BRIDGE_DECK_EAST_X;
      const highX = centerX + dirX * (length / 2);
      const highZ = centerZ + dirZ * (length / 2);

      expect(highX).toBeCloseTo(deckEdgeX, 6);
      expect(highZ).toBeCloseTo(BRIDGE_CENTER_Z, 6);
      expect(rampSurfaceHeightAt(ramp, deckEdgeX, BRIDGE_CENTER_Z)).toBeCloseTo(
        BRIDGE_DECK_TOP_Y,
        6,
      );
      expect(terrainHeightAt(deckEdgeX + dirX * 0.001, BRIDGE_CENTER_Z)).toBeCloseTo(
        BRIDGE_DECK_TOP_Y,
        6,
      );
    }
  });

  it('keeps the full bridge centerline profile free of step-height discontinuities', () => {
    const dx = 0.01;
    const maxRampDelta = (BRIDGE_RAMP_HEIGHT / BRIDGE_RAMP_LENGTH) * dx + 1e-6;

    for (let x = BRIDGE_LANDING_WEST_X; x < BRIDGE_LANDING_EAST_X; x += dx) {
      const heightDelta = Math.abs(
        terrainHeightAt(x + dx, BRIDGE_CENTER_Z) - terrainHeightAt(x, BRIDGE_CENTER_Z),
      );

      expect(heightDelta).toBeLessThanOrEqual(maxRampDelta);
    }
  });
});

function directionVector(direction: 'posX' | 'negX' | 'posZ' | 'negZ'): readonly [number, number] {
  switch (direction) {
    case 'posX':
      return [1, 0];
    case 'negX':
      return [-1, 0];
    case 'posZ':
      return [0, 1];
    case 'negZ':
      return [0, -1];
  }
}

import { describe, expect, it } from 'vitest';
import { ARENA } from '../constants.ts';
import {
  ARENA_FLOOR_PANEL_GAP,
  ARENA_FLOOR_PANEL_OFFSET,
  ARENA_FLOOR_PANEL_SIZE,
  createWallDefs,
  FLOOR_PANELS,
} from './arenaData.ts';
import { QUADRANT_CENTER_OFFSET, ZONE_CENTERS } from './zoneLayout.ts';

describe('arena envelope geometry', () => {
  it('expands the maneuvering cage to 18x18 meters', () => {
    expect(ARENA.size).toBe(18);
  });

  it('moves walls to the expanded arena boundary', () => {
    const walls = createWallDefs();
    const half = ARENA.size / 2;
    const wallOffset = ARENA.wallThickness / 2;

    expect(walls.find((wall) => wall.id === 'north')?.position[2]).toBeCloseTo(
      -half - wallOffset,
      6,
    );
    expect(walls.find((wall) => wall.id === 'south')?.position[2]).toBeCloseTo(
      half + wallOffset,
      6,
    );
    expect(walls.find((wall) => wall.id === 'west')?.position[0]).toBeCloseTo(
      -half - wallOffset,
      6,
    );
    expect(walls.find((wall) => wall.id === 'east')?.position[0]).toBeCloseTo(half + wallOffset, 6);
  });

  it('scales quadrant floor panels with the arena instead of fixed old coordinates', () => {
    expect(ARENA_FLOOR_PANEL_OFFSET).toBe(ARENA.size / 4);
    expect(QUADRANT_CENTER_OFFSET).toBe(ARENA_FLOOR_PANEL_OFFSET);
    expect(ARENA_FLOOR_PANEL_SIZE).toBe(ARENA.size / 2 - ARENA_FLOOR_PANEL_GAP);

    for (const panel of FLOOR_PANELS) {
      expect(Math.abs(panel.position[0])).toBeCloseTo(ARENA_FLOOR_PANEL_OFFSET, 6);
      expect(Math.abs(panel.position[2])).toBeCloseTo(ARENA_FLOOR_PANEL_OFFSET, 6);
      expect(panel.size).toEqual([ARENA_FLOOR_PANEL_SIZE, ARENA_FLOOR_PANEL_SIZE]);
    }
  });

  it('places each training sector at the center of its arena quadrant', () => {
    expect(ZONE_CENTERS.A).toEqual({ x: -ARENA.size / 4, z: -ARENA.size / 4 });
    expect(ZONE_CENTERS.B).toEqual({ x: ARENA.size / 4, z: -ARENA.size / 4 });
    expect(ZONE_CENTERS.C).toEqual({ x: -ARENA.size / 4, z: ARENA.size / 4 });
    expect(ZONE_CENTERS.D).toEqual({ x: ARENA.size / 4, z: ARENA.size / 4 });
  });
});

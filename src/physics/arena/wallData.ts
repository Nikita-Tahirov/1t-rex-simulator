import { ARENA } from '../constants.ts';
import type { WallDef } from './types.ts';

/** Стены для произвольного размера арены (используется сетевым боем для 36 м). */
export function createWallDefsForSize(size: number): WallDef[] {
  const half = size / 2;
  const wallY = ARENA.wallHeight / 2;
  const wallOffset = ARENA.wallThickness / 2;
  return [
    {
      id: 'north',
      position: [0, wallY, -half - wallOffset],
      half: [half + 0.5, wallY, wallOffset],
    },
    { id: 'south', position: [0, wallY, half + wallOffset], half: [half + 0.5, wallY, wallOffset] },
    { id: 'west', position: [-half - wallOffset, wallY, 0], half: [wallOffset, wallY, half + 0.5] },
    { id: 'east', position: [half + wallOffset, wallY, 0], half: [wallOffset, wallY, half + 0.5] },
  ];
}

/** Стены для одиночной арены (18 м). Делегат — `arenaData.test.ts` зовёт без аргументов. */
export function createWallDefs(): WallDef[] {
  return createWallDefsForSize(ARENA.size);
}

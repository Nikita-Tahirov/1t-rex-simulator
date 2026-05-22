import { ARENA } from '../constants.ts';
import type { WallDef } from './types.ts';

export function createWallDefs(): WallDef[] {
  const half = ARENA.size / 2;
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

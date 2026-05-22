import {
  BRIDGE_CENTER_X,
  BRIDGE_CENTER_Z,
  BRIDGE_DECK_HALF_X,
  BRIDGE_DECK_HALF_Z,
  BRIDGE_DECK_TOP_Y,
  BRIDGE_LANDING_HALF_X,
  BRIDGE_LANDING_HALF_Z,
  BRIDGE_RAMPS,
  SECTOR_ENTRY_RAMPS,
  SECTOR_PAD_TOP_Y,
  ZONE_A_PAD_HALF_X,
  ZONE_A_PAD_HALF_Z,
  ZONE_B_PAD_HALF_X,
  ZONE_B_PAD_HALF_Z,
  ZONE_C_PAD_HALF_X,
  ZONE_C_PAD_HALF_Z,
} from './arenaData.ts';
import type { RampBlockDef } from './types.ts';
import { ZONE_CENTERS } from './zoneLayout.ts';

const BOUNDS_EPS = 1e-9;

interface DrivablePlatform {
  id: string;
  centerX: number;
  centerZ: number;
  halfX: number;
  halfZ: number;
  height: number;
}

export const DRIVABLE_PLATFORMS: readonly DrivablePlatform[] = [
  {
    id: 'zone-a-service-pad',
    centerX: ZONE_CENTERS.A.x,
    centerZ: ZONE_CENTERS.A.z,
    halfX: ZONE_A_PAD_HALF_X,
    halfZ: ZONE_A_PAD_HALF_Z,
    height: SECTOR_PAD_TOP_Y,
  },
  {
    id: 'zone-b-impact-pad',
    centerX: ZONE_CENTERS.B.x,
    centerZ: ZONE_CENTERS.B.z,
    halfX: ZONE_B_PAD_HALF_X,
    halfZ: ZONE_B_PAD_HALF_Z,
    height: SECTOR_PAD_TOP_Y,
  },
  {
    id: 'zone-c-garage-floor',
    centerX: ZONE_CENTERS.C.x,
    centerZ: ZONE_CENTERS.C.z,
    halfX: ZONE_C_PAD_HALF_X,
    halfZ: ZONE_C_PAD_HALF_Z,
    height: SECTOR_PAD_TOP_Y,
  },
  {
    id: 'zone-d-landing-pad',
    centerX: BRIDGE_CENTER_X,
    centerZ: BRIDGE_CENTER_Z,
    halfX: BRIDGE_LANDING_HALF_X,
    halfZ: BRIDGE_LANDING_HALF_Z,
    height: SECTOR_PAD_TOP_Y,
  },
  {
    id: 'zone-d-bridge-deck',
    centerX: BRIDGE_CENTER_X,
    centerZ: BRIDGE_CENTER_Z,
    halfX: BRIDGE_DECK_HALF_X,
    halfZ: BRIDGE_DECK_HALF_Z,
    height: BRIDGE_DECK_TOP_Y,
  },
];

/**
 * Высота поверхности в точке (x, z), опционально с подсказкой о текущей высоте
 * робота. Hint используется, чтобы для каждой платформы решить, «выше» или
 * «ниже» робота она находится: робот стоящий на полу под мостом не должен
 * teleportироваться на deck (Y=0.6), а робот заехавший на deck — должен.
 *
 * Без hint берётся max по всем платформам/рампам (старое поведение): это нужно
 * сценариям/тестам, которым нужна абсолютная top-surface.
 */
export function terrainHeightAt(x: number, z: number, currentY?: number): number {
  let height = 0;

  for (const platform of DRIVABLE_PLATFORMS) {
    if (!isInsidePlatform(platform, x, z)) continue;
    if (currentY !== undefined && currentY + PLATFORM_REACH_TOLERANCE < platform.height) continue;
    height = Math.max(height, platform.height);
  }

  for (const ramp of SECTOR_ENTRY_RAMPS) {
    height = Math.max(height, rampSurfaceHeightAt(ramp, x, z) ?? 0);
  }
  for (const ramp of BRIDGE_RAMPS) {
    height = Math.max(height, rampSurfaceHeightAt(ramp, x, z) ?? 0);
  }

  return height;
}

/** Робот «дотягивается» до платформы, пока ниже её верха не более чем на 0.2 м
 * (= chassisHeight). Иначе мы внизу — под мостом, на земле. */
const PLATFORM_REACH_TOLERANCE = 0.2;

export function rampSurfaceHeightAt(ramp: RampBlockDef, x: number, z: number): number | null {
  const [length, width, height] = ramp.size;
  const [centerX, baseY, centerZ] = ramp.position;
  const dx = x - centerX;
  const dz = z - centerZ;
  const [dirX, dirZ] = directionVector(ramp);
  const along = dx * dirX + dz * dirZ;
  const across = dx * -dirZ + dz * dirX;

  if (Math.abs(along) > length / 2 + BOUNDS_EPS || Math.abs(across) > width / 2 + BOUNDS_EPS) {
    return null;
  }
  return baseY + ((along + length / 2) / length) * height;
}

function directionVector(ramp: RampBlockDef): readonly [number, number] {
  switch (ramp.direction) {
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

function isInsidePlatform(platform: DrivablePlatform, x: number, z: number): boolean {
  return (
    Math.abs(x - platform.centerX) <= platform.halfX &&
    Math.abs(z - platform.centerZ) <= platform.halfZ
  );
}

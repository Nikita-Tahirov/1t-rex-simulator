import { ARENA_COLORS, SIM_COLORS } from '@/theme/tokens.ts';
import { ARENA, ROBOT } from '../constants.ts';
import type {
  ArenaAxisDef,
  DamageCrateDef,
  FloorPanelDef,
  RampBlockDef,
  StaticBlockDef,
} from './types.ts';
import { ZONE_CENTERS } from './zoneLayout.ts';

export { createWallDefs } from './wallData.ts';

/** Self-hosted шрифт drei `<Text>`-меток арены: без него drei тянет Roboto с CDN ↔ CSP `font-src 'self' data:`. */
export const ARENA_TEXT_FONT_URL = '/fonts/Roboto-Regular.ttf';

export const ARENA_FLOOR_PANEL_GAP = 0.1;
export const ARENA_FLOOR_PANEL_OFFSET = ARENA.size / 4;
export const ARENA_FLOOR_PANEL_SIZE = ARENA.size / 2 - ARENA_FLOOR_PANEL_GAP;

export const FLOOR_PANELS: FloorPanelDef[] = [
  {
    id: 'nw',
    color: '#33333a',
    opacity: 0.55,
    position: [-ARENA_FLOOR_PANEL_OFFSET, 0.003, -ARENA_FLOOR_PANEL_OFFSET],
    size: [ARENA_FLOOR_PANEL_SIZE, ARENA_FLOOR_PANEL_SIZE],
  },
  {
    id: 'ne',
    color: '#26262c',
    opacity: 0.7,
    position: [ARENA_FLOOR_PANEL_OFFSET, 0.003, -ARENA_FLOOR_PANEL_OFFSET],
    size: [ARENA_FLOOR_PANEL_SIZE, ARENA_FLOOR_PANEL_SIZE],
  },
  {
    id: 'sw',
    color: '#26262c',
    opacity: 0.7,
    position: [-ARENA_FLOOR_PANEL_OFFSET, 0.003, ARENA_FLOOR_PANEL_OFFSET],
    size: [ARENA_FLOOR_PANEL_SIZE, ARENA_FLOOR_PANEL_SIZE],
  },
  {
    id: 'se',
    color: '#33333a',
    opacity: 0.55,
    position: [ARENA_FLOOR_PANEL_OFFSET, 0.003, ARENA_FLOOR_PANEL_OFFSET],
    size: [ARENA_FLOOR_PANEL_SIZE, ARENA_FLOOR_PANEL_SIZE],
  },
];

export const ARENA_AXES: ArenaAxisDef[] = [
  { id: 'x', color: SIM_COLORS.warn, rotation: 0 },
  { id: 'z', color: SIM_COLORS.warn, rotation: Math.PI / 2 },
];
export const MAX_RAMP_SLOPE_DEG = 20;
export const SECTOR_PAD_TOP_Y = 0.07;
export const ZONE_A_PAD_HALF_X = 2.05;
export const ZONE_A_PAD_HALF_Z = 1.45;
export const ZONE_B_PAD_HALF_X = 2.1;
export const ZONE_B_PAD_HALF_Z = 1.65;
export const ZONE_C_PAD_HALF_X = 1.45;
export const ZONE_C_PAD_HALF_Z = 1.55;
export const SECTOR_ENTRY_RAMP_LENGTH = 0.58;
export const SECTOR_ENTRY_RAMP_HEIGHT = SECTOR_PAD_TOP_Y;
export const BRIDGE_DECK_TOP_Y = 0.6;
export const BRIDGE_RAMP_LENGTH = 1.55;
export const BRIDGE_RAMP_HEIGHT = BRIDGE_DECK_TOP_Y - SECTOR_PAD_TOP_Y;
export const BRIDGE_CENTER_X = ZONE_CENTERS.D.x;
export const BRIDGE_CENTER_Z = ZONE_CENTERS.D.z;
export const BRIDGE_LANDING_HALF_X = 2.35;
export const BRIDGE_LANDING_HALF_Z = 1.35;
export const BRIDGE_LANDING_WEST_X = BRIDGE_CENTER_X - BRIDGE_LANDING_HALF_X;
export const BRIDGE_LANDING_EAST_X = BRIDGE_CENTER_X + BRIDGE_LANDING_HALF_X;
export const BRIDGE_DECK_HALF_Y = 0.08;
export const BRIDGE_DECK_HALF_Z = 0.7;
export const BRIDGE_DECK_WEST_X = BRIDGE_LANDING_WEST_X + BRIDGE_RAMP_LENGTH;
export const BRIDGE_DECK_EAST_X = BRIDGE_LANDING_EAST_X - BRIDGE_RAMP_LENGTH;
export const BRIDGE_DECK_HALF_X = (BRIDGE_DECK_EAST_X - BRIDGE_DECK_WEST_X) / 2;
export const BRIDGE_DECK_CENTER_Y = BRIDGE_DECK_TOP_Y - BRIDGE_DECK_HALF_Y;
export const SHREDDER_CENTER = [ZONE_CENTERS.A.x, ZONE_CENTERS.A.z] as const;
export const SHREDDER_BLADE_SIZE: [number, number, number] = [1.75, 0.08, 0.22];
export const SHREDDER_BLADE_HALF: [number, number, number] = [0.875, 0.04, 0.11];
export const SHREDDER_HUB_RADIUS = 0.28;
export const SHREDDER_DAMAGE_RADIUS = 1.05;
export const ROBOT_DAMAGE_FOOTPRINT_RADIUS = Math.hypot(
  ROBOT.chassisLength / 2,
  ROBOT.chassisWidth / 2,
);
export const SHREDDER_DAMAGE_PER_SECOND = 35;
export const SHREDDER_CONTACT_DAMAGE = 10;
export const SHREDDER_FRICTION_COEFFICIENT = 0.55;
export const SHREDDER_JOULES_PER_DAMAGE = 12;
export const SHREDDER_ROTATION_SPEED = 5.5;
export const SHREDDER_TEETH: StaticBlockDef[] = [
  {
    id: 'zone-a-tooth-l',
    color: ARENA_COLORS.shredder.tooth,
    emissive: ARENA_COLORS.shredder.emissive,
    half: [0.12, 0.32, 0.7],
    position: [ZONE_CENTERS.A.x - 1.45, 0.32, ZONE_CENTERS.A.z],
  },
  {
    id: 'zone-a-tooth-r',
    color: ARENA_COLORS.shredder.tooth,
    emissive: ARENA_COLORS.shredder.emissive,
    half: [0.12, 0.32, 0.7],
    position: [ZONE_CENTERS.A.x + 1.45, 0.32, ZONE_CENTERS.A.z],
  },
];

export const CRATES: DamageCrateDef[] = [
  {
    id: 'b-crate-1',
    color: ARENA_COLORS.crates.primary,
    position: [ZONE_CENTERS.B.x - 0.9, 0.25, ZONE_CENTERS.B.z - 0.45],
    size: [0.5, 0.5, 0.5],
  },
  {
    id: 'b-crate-2',
    color: ARENA_COLORS.crates.secondary,
    position: [ZONE_CENTERS.B.x - 0.2, 0.25, ZONE_CENTERS.B.z - 0.6],
    size: [0.5, 0.5, 0.5],
  },
  {
    id: 'b-crate-3',
    color: '#ff9b38',
    position: [ZONE_CENTERS.B.x + 0.5, 0.25, ZONE_CENTERS.B.z - 0.35],
    size: [0.5, 0.5, 0.5],
  },
  {
    id: 'b-crate-4',
    color: ARENA_COLORS.crates.primary,
    position: [ZONE_CENTERS.B.x - 0.55, 0.75, ZONE_CENTERS.B.z - 0.47],
    size: [0.48, 0.48, 0.48],
  },
  {
    id: 'b-crate-5',
    color: ARENA_COLORS.crates.secondary,
    position: [ZONE_CENTERS.B.x + 0.15, 0.75, ZONE_CENTERS.B.z - 0.51],
    size: [0.48, 0.48, 0.48],
  },
  {
    id: 'b-crate-6',
    color: ARENA_COLORS.crates.highlight,
    position: [ZONE_CENTERS.B.x + 0.9, 0.25, ZONE_CENTERS.B.z + 0.55],
    size: [0.44, 0.44, 0.44],
  },
];

export const GARAGE_POSTS: StaticBlockDef[] = [
  {
    id: 'zone-c-post-front-n',
    color: ARENA_COLORS.garage.primary,
    emissive: ARENA_COLORS.garage.emissive,
    half: [0.08, 0.48, 0.08],
    position: [ZONE_CENTERS.C.x + 1.5, 0.48, ZONE_CENTERS.C.z - 1.5],
  },
  {
    id: 'zone-c-post-front-s',
    color: ARENA_COLORS.garage.primary,
    emissive: ARENA_COLORS.garage.emissive,
    half: [0.08, 0.48, 0.08],
    position: [ZONE_CENTERS.C.x + 1.5, 0.48, ZONE_CENTERS.C.z + 1.5],
  },
];

export const BRIDGE_RAILS: StaticBlockDef[] = [
  {
    id: 'zone-d-rail-n',
    color: ARENA_COLORS.bridge.rail,
    emissive: ARENA_COLORS.bridge.emissive,
    half: [1.15, 0.18, 0.06],
    position: [BRIDGE_CENTER_X, 0.78, BRIDGE_CENTER_Z - 0.78],
  },
  {
    id: 'zone-d-rail-s',
    color: ARENA_COLORS.bridge.rail,
    emissive: ARENA_COLORS.bridge.emissive,
    half: [1.15, 0.18, 0.06],
    position: [BRIDGE_CENTER_X, 0.78, BRIDGE_CENTER_Z + 0.78],
  },
  {
    id: 'zone-d-leg-a',
    color: ARENA_COLORS.bridge.leg,
    emissive: ARENA_COLORS.bridge.emissive,
    half: [0.08, 0.28, 0.08],
    position: [BRIDGE_CENTER_X - 0.95, 0.28, BRIDGE_CENTER_Z - 0.65],
  },
  {
    id: 'zone-d-leg-b',
    color: ARENA_COLORS.bridge.leg,
    emissive: ARENA_COLORS.bridge.emissive,
    half: [0.08, 0.28, 0.08],
    position: [BRIDGE_CENTER_X + 0.95, 0.28, BRIDGE_CENTER_Z + 0.65],
  },
];

export const SECTOR_ENTRY_RAMPS: RampBlockDef[] = [
  {
    id: 'zone-a-entry-ramp-s',
    zone: 'A',
    kind: 'sector-entry',
    color: ARENA_COLORS.shredder.primary,
    emissive: ARENA_COLORS.shredder.emissive,
    direction: 'negZ',
    position: [
      ZONE_CENTERS.A.x,
      0,
      ZONE_CENTERS.A.z + ZONE_A_PAD_HALF_Z + SECTOR_ENTRY_RAMP_LENGTH / 2,
    ],
    size: [SECTOR_ENTRY_RAMP_LENGTH, 2.7, SECTOR_ENTRY_RAMP_HEIGHT],
  },
  {
    id: 'zone-b-entry-ramp-w',
    zone: 'B',
    kind: 'sector-entry',
    color: ARENA_COLORS.crates.primary,
    emissive: ARENA_COLORS.crates.emissive,
    direction: 'posX',
    position: [
      ZONE_CENTERS.B.x - ZONE_B_PAD_HALF_X - SECTOR_ENTRY_RAMP_LENGTH / 2,
      0,
      ZONE_CENTERS.B.z,
    ],
    size: [SECTOR_ENTRY_RAMP_LENGTH, 2.15, SECTOR_ENTRY_RAMP_HEIGHT],
  },
  {
    id: 'zone-b-entry-ramp-s',
    zone: 'B',
    kind: 'sector-entry',
    color: ARENA_COLORS.crates.primary,
    emissive: ARENA_COLORS.crates.emissive,
    direction: 'negZ',
    position: [
      ZONE_CENTERS.B.x,
      0,
      ZONE_CENTERS.B.z + ZONE_B_PAD_HALF_Z + SECTOR_ENTRY_RAMP_LENGTH / 2,
    ],
    size: [SECTOR_ENTRY_RAMP_LENGTH, 1.5, SECTOR_ENTRY_RAMP_HEIGHT],
  },
  {
    id: 'zone-c-entry-ramp-e',
    zone: 'C',
    kind: 'sector-entry',
    color: ARENA_COLORS.garage.primary,
    emissive: ARENA_COLORS.garage.emissive,
    direction: 'negX',
    position: [
      ZONE_CENTERS.C.x + ZONE_C_PAD_HALF_X + SECTOR_ENTRY_RAMP_LENGTH / 2,
      0,
      ZONE_CENTERS.C.z,
    ],
    size: [SECTOR_ENTRY_RAMP_LENGTH, 1.8, SECTOR_ENTRY_RAMP_HEIGHT],
  },
  {
    id: 'zone-d-entry-ramp-w',
    zone: 'D',
    kind: 'sector-entry',
    color: ARENA_COLORS.bridge.primary,
    emissive: ARENA_COLORS.bridge.emissive,
    direction: 'posX',
    position: [BRIDGE_LANDING_WEST_X - SECTOR_ENTRY_RAMP_LENGTH / 2, 0, BRIDGE_CENTER_Z],
    size: [SECTOR_ENTRY_RAMP_LENGTH, 1.95, SECTOR_ENTRY_RAMP_HEIGHT],
  },
  {
    id: 'zone-d-entry-ramp-e',
    zone: 'D',
    kind: 'sector-entry',
    color: ARENA_COLORS.bridge.primary,
    emissive: ARENA_COLORS.bridge.emissive,
    direction: 'negX',
    position: [BRIDGE_LANDING_EAST_X + SECTOR_ENTRY_RAMP_LENGTH / 2, 0, BRIDGE_CENTER_Z],
    size: [SECTOR_ENTRY_RAMP_LENGTH, 1.95, SECTOR_ENTRY_RAMP_HEIGHT],
  },
];

export const BRIDGE_RAMPS: RampBlockDef[] = [
  {
    id: 'zone-d-ramp-in',
    zone: 'D',
    kind: 'bridge-access',
    color: ARENA_COLORS.bridge.primary,
    emissive: ARENA_COLORS.bridge.emissive,
    direction: 'posX',
    position: [BRIDGE_LANDING_WEST_X + BRIDGE_RAMP_LENGTH / 2, SECTOR_PAD_TOP_Y, BRIDGE_CENTER_Z],
    size: [BRIDGE_RAMP_LENGTH, 1.44, BRIDGE_RAMP_HEIGHT],
  },
  {
    id: 'zone-d-ramp-out',
    zone: 'D',
    kind: 'bridge-access',
    color: ARENA_COLORS.bridge.primary,
    emissive: ARENA_COLORS.bridge.emissive,
    direction: 'negX',
    position: [BRIDGE_LANDING_EAST_X - BRIDGE_RAMP_LENGTH / 2, SECTOR_PAD_TOP_Y, BRIDGE_CENTER_Z],
    size: [BRIDGE_RAMP_LENGTH, 1.44, BRIDGE_RAMP_HEIGHT],
  },
];

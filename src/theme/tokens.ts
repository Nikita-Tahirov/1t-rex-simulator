export const SIM_COLORS = {
  sceneBackground: '#18181c',
  deepBackground: '#0a0a0e',
  // gridMajor/gridMinor рисуют швы бетонных плит (drei gridHelper);
  // близки к floorBase, чтобы читались как стыки, а не «неоновая сетка».
  gridMajor: '#3a3a3e',
  gridMinor: '#2a2a2e',
  floorBase: '#28282c',
  floorEmissive: '#0e0e10',
  wallBase: '#1f1f23',
  wallEmissive: '#0a0a0c',
  accentCyan: '#4cbcff',
  accentPink: '#ff4fc3',
  accentPurple: '#8a6cff',
  robotBody: '#6e5dff',
  robotWheel: '#1a1a1f',
  robotSpinner: '#ff57c7',
  panelGlass: 'rgba(18, 10, 32, 0.76)',
  panelBorder: 'rgba(255, 255, 255, 0.08)',
  textDim: '#c0bdd0',
  danger: '#ff3b30',
  warn: '#ffb340',
} as const;

export const ARENA_COLORS = {
  shredder: {
    primary: '#ff3b30',
    floor: '#2a1216',
    emissive: '#5a0810',
    darkMetal: '#1c0a0a',
    stopper: '#2e0a0a',
    tooth: '#44100f',
  },
  crates: {
    primary: '#ff7a1a',
    secondary: '#e85c10',
    highlight: '#ffb340',
    damaged: '#6a2e10',
    critical: '#ff4a4a',
    floor: '#2a1808',
    emissive: '#5a2200',
    bumper: '#2e1408',
    label: '#ffe0a6',
  },
  garage: {
    primary: '#4ade80',
    floor: '#0d2a14',
    wall: '#0a1f10',
    roof: '#143b1f',
    emissive: '#14803a',
  },
  bridge: {
    primary: '#8a8a90',
    floor: '#1f1f23',
    deck: '#2a2a30',
    rail: '#15151a',
    leg: '#1a1a20',
    emissive: '#4a4a50',
  },
} as const;

export const DAMAGE_EFFECT_COLORS = {
  scorch: '#ff5a3d',
  smoke: '#858b94',
  sparkWarm: '#ffd166',
  sparkCool: '#7dd8ff',
  sparkHot: '#ff8a3d',
  sparkWhite: '#fff0a8',
  flameOuter: '#ff7a1a',
  flameInner: '#ffd166',
} as const;

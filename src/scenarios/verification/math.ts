import type { ScenarioLogEntry } from '@/store/scenario-store.ts';
import type { TraceStats } from './types.ts';

const EMPTY_STATS: TraceStats = {
  sampleCount: 0,
  pathLengthM: 0,
  maxSpeedMps: 0,
  maxAbsYawRate: 0,
  pilotActiveRatio: 0,
  maxAbsThrottle: 0,
  maxAbsTurn: 0,
  commandResponseRatio: 0,
  lateralTravelM: 0,
  zAxisCrossings: 0,
  xMin: 0,
  xMax: 0,
  zMin: 0,
  zMax: 0,
  startX: 0,
  startZ: 0,
  endX: 0,
  endZ: 0,
  maxSegmentDtSec: 0,
  maxSegmentSpeedMps: 0,
};

export function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(digits);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export function summarizeTrace(entries: ScenarioLogEntry[]): TraceStats {
  if (entries.length === 0) return EMPTY_STATS;

  let pathLengthM = 0;
  let maxSpeedMps = 0;
  let maxAbsYawRate = 0;
  let pilotActiveSamples = 0;
  let commandSamples = 0;
  let commandResponseSamples = 0;
  let maxAbsThrottle = 0;
  let maxAbsTurn = 0;
  let lateralTravelM = 0;
  let zAxisCrossings = 0;
  let lastZSign = zSign(entries[0]?.z ?? 0);
  let xMin = entries[0]?.x ?? 0;
  let xMax = xMin;
  let zMin = entries[0]?.z ?? 0;
  let zMax = zMin;
  let maxSegmentDtSec = 0;
  let maxSegmentSpeedMps = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (i > 0) {
      const prev = entries[i - 1]!;
      const segmentLengthM = dist(prev.x, prev.z, entry.x, entry.z);
      const segmentDtSec = entry.t - prev.t;
      pathLengthM += segmentLengthM;
      lateralTravelM += Math.abs(entry.z - prev.z);
      if (Number.isFinite(segmentDtSec) && segmentDtSec > 0) {
        maxSegmentDtSec = Math.max(maxSegmentDtSec, segmentDtSec);
        maxSegmentSpeedMps = Math.max(maxSegmentSpeedMps, segmentLengthM / segmentDtSec);
      }
    }
    const currentZSign = zSign(entry.z);
    if (currentZSign !== 0) {
      if (lastZSign !== 0 && currentZSign !== lastZSign) zAxisCrossings += 1;
      lastZSign = currentZSign;
    }
    if (entry.speed > maxSpeedMps) maxSpeedMps = entry.speed;
    const absYawRate = Math.abs(entry.yawRate);
    if (absYawRate > maxAbsYawRate) maxAbsYawRate = absYawRate;
    if (entry.pilotActive) pilotActiveSamples += 1;
    const absThrottle = Math.abs(entry.pilotThrottle ?? 0);
    const absTurn = Math.abs(entry.pilotTurn ?? 0);
    if (absThrottle > maxAbsThrottle) maxAbsThrottle = absThrottle;
    if (absTurn > maxAbsTurn) maxAbsTurn = absTurn;
    if (entry.pilotActive && (absThrottle > 0.1 || absTurn > 0.1)) {
      commandSamples += 1;
      if (entry.speed > 0.15 || absYawRate > 0.15) commandResponseSamples += 1;
    }
    if (entry.x < xMin) xMin = entry.x;
    if (entry.x > xMax) xMax = entry.x;
    if (entry.z < zMin) zMin = entry.z;
    if (entry.z > zMax) zMax = entry.z;
  }

  const first = entries[0]!;
  const last = entries[entries.length - 1]!;
  return {
    sampleCount: entries.length,
    pathLengthM,
    maxSpeedMps,
    maxAbsYawRate,
    pilotActiveRatio: pilotActiveSamples / entries.length,
    maxAbsThrottle,
    maxAbsTurn,
    commandResponseRatio: commandSamples === 0 ? 0 : commandResponseSamples / commandSamples,
    lateralTravelM,
    zAxisCrossings,
    xMin,
    xMax,
    zMin,
    zMax,
    startX: first.x,
    startZ: first.z,
    endX: last.x,
    endZ: last.z,
    maxSegmentDtSec,
    maxSegmentSpeedMps,
  };
}

function zSign(z: number): -1 | 0 | 1 {
  if (z > 0.15) return 1;
  if (z < -0.15) return -1;
  return 0;
}

export function lastEvent(entries: ScenarioLogEntry[], name: string): number {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const value = entries[i]?.events?.[name];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

export function minDistanceTo(entries: ScenarioLogEntry[], x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    const d = dist(entry.x, entry.z, x, z);
    if (d < best) best = d;
  }
  return best;
}

export function maxValue(
  entries: ScenarioLogEntry[],
  pick: (entry: ScenarioLogEntry) => number,
): number {
  let best = 0;
  for (const entry of entries) {
    const value = pick(entry);
    if (Number.isFinite(value) && value > best) best = value;
  }
  return best;
}

export function pickTargetPosition(seed: number): { x: number; z: number } {
  const a = (seed * 9301 + 49297) % 233280;
  const angle = (a / 233280) * Math.PI * 2;
  const radius = 3 + ((a >> 3) % 100) / 100;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

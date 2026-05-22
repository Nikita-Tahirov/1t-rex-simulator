export const KNOWN_SCENARIOS = new Set([
  'figureEight',
  'obstacleAvoidance',
  'searchAndStrike',
  'spinnerImpact',
  'madgwickVsComplementary',
  'fsmVsBt',
  'brownoutDischarge',
]);

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function num(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function parsePayload(raw, file) {
  const parsed = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error(`${file}: root must be an object`);
  return {
    scenarioId: typeof parsed.scenarioId === 'string' ? parsed.scenarioId : 'unknown',
    seed: num(parsed.seed),
    status: typeof parsed.status === 'string' ? parsed.status : 'unknown',
    elapsedSec: num(parsed.elapsedSec),
    summary: isRecord(parsed.summary) ? parsed.summary : {},
    verification: isRecord(parsed.verification) ? parsed.verification : null,
    entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isEntry) : [],
  };
}

function isEntry(entry) {
  return isRecord(entry) && Number.isFinite(entry.x) && Number.isFinite(entry.z);
}

export function fmt(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

export function dist(a, b, c, d) {
  return Math.hypot(a - c, b - d);
}

export function summarize(entries) {
  if (entries.length === 0) return emptyStats();
  let active = 0;
  let command = 0;
  let response = 0;
  let maxSpeed = 0;
  let maxAbsYawRate = 0;
  let maxAbsTurn = 0;
  let pathLengthM = 0;
  let lateralTravelM = 0;
  let zAxisCrossings = 0;
  let lastZSign = zSign(entries[0].z);
  let xMin = entries[0].x;
  let xMax = entries[0].x;
  let zMin = entries[0].z;
  let zMax = entries[0].z;
  let maxSegmentDtSec = 0;
  let maxSegmentSpeedMps = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (i > 0) {
      const prev = entries[i - 1];
      const segmentLengthM = dist(prev.x, prev.z, entry.x, entry.z);
      const segmentDtSec = num(entry.t) - num(prev.t);
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
    if (entry.pilotActive) active += 1;
    const throttle = Math.abs(num(entry.pilotThrottle));
    const turn = Math.abs(num(entry.pilotTurn));
    maxAbsTurn = Math.max(maxAbsTurn, turn);
    if (entry.pilotActive && (throttle > 0.1 || turn > 0.1)) {
      command += 1;
      if (num(entry.speed) > 0.15 || Math.abs(num(entry.yawRate)) > 0.15) response += 1;
    }
    maxSpeed = Math.max(maxSpeed, num(entry.speed));
    maxAbsYawRate = Math.max(maxAbsYawRate, Math.abs(num(entry.yawRate)));
    xMin = Math.min(xMin, entry.x);
    xMax = Math.max(xMax, entry.x);
    zMin = Math.min(zMin, entry.z);
    zMax = Math.max(zMax, entry.z);
  }
  const first = entries[0];
  const last = entries.at(-1);
  return {
    sampleCount: entries.length,
    pathLengthM,
    maxSpeedMps: maxSpeed,
    maxAbsYawRate,
    maxAbsTurn,
    lateralTravelM,
    zAxisCrossings,
    pilotActiveRatio: active / entries.length,
    commandResponseRatio: command === 0 ? 0 : response / command,
    startX: first.x,
    startZ: first.z,
    endX: last.x,
    endZ: last.z,
    xMin,
    xMax,
    zMin,
    zMax,
    maxSegmentDtSec,
    maxSegmentSpeedMps,
  };
}

function zSign(z) {
  if (z > 0.15) return 1;
  if (z < -0.15) return -1;
  return 0;
}

function emptyStats() {
  return {
    sampleCount: 0,
    pathLengthM: 0,
    maxSpeedMps: 0,
    maxAbsYawRate: 0,
    maxAbsTurn: 0,
    lateralTravelM: 0,
    zAxisCrossings: 0,
    pilotActiveRatio: 0,
    commandResponseRatio: 0,
    startX: 0,
    startZ: 0,
    endX: 0,
    endZ: 0,
    xMin: 0,
    xMax: 0,
    zMin: 0,
    zMax: 0,
    maxSegmentDtSec: 0,
    maxSegmentSpeedMps: 0,
  };
}

export function lastEvent(entries, name) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const value = entries[i]?.events?.[name];
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

export function minDistanceTo(entries, x, z) {
  let best = Number.POSITIVE_INFINITY;
  for (const entry of entries) best = Math.min(best, dist(entry.x, entry.z, x, z));
  return best;
}

export function maxValue(entries, pick) {
  let best = 0;
  for (const entry of entries) best = Math.max(best, num(pick(entry)));
  return best;
}

export function pickTarget(seed) {
  const a = (seed * 9301 + 49297) % 233280;
  const angle = (a / 233280) * Math.PI * 2;
  const radius = 3 + ((a >> 3) % 100) / 100;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

export function add(checks, id, passed, actual, expected) {
  checks.push({ id, passed, actual, expected });
}

export function result(payload, stats, checks) {
  const passed = checks.every((item) => item.passed);
  return {
    scenarioId: payload.scenarioId,
    passed,
    score: checks.filter((item) => item.passed).length / checks.length,
    checks,
    observed: {
      sampleCount: stats.sampleCount,
      pathLengthM: fmt(stats.pathLengthM),
      maxSpeedMps: fmt(stats.maxSpeedMps),
      maxAbsYawRate: fmt(stats.maxAbsYawRate),
      maxAbsTurn: fmt(stats.maxAbsTurn),
      lateralTravelM: fmt(stats.lateralTravelM),
      zAxisCrossings: stats.zAxisCrossings,
      pilotActiveRatio: fmt(stats.pilotActiveRatio),
      commandResponseRatio: fmt(stats.commandResponseRatio),
      startX: fmt(stats.startX),
      startZ: fmt(stats.startZ),
      endX: fmt(stats.endX),
      endZ: fmt(stats.endZ),
      maxSegmentDtSec: fmt(stats.maxSegmentDtSec),
      maxSegmentSpeedMps: fmt(stats.maxSegmentSpeedMps),
    },
  };
}

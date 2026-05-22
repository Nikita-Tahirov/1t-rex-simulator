import { readFileSync } from 'node:fs';

function usage() {
  console.error('Usage: npm run scenario:analyze -- <scenario-log.json> [...more.json]');
  process.exitCode = 1;
}

function finite(values) {
  return values.filter((value) => Number.isFinite(value));
}

function avg(values) {
  const xs = finite(values);
  return xs.length === 0 ? null : xs.reduce((sum, value) => sum + value, 0) / xs.length;
}

function min(values) {
  const xs = finite(values);
  return xs.length === 0 ? null : Math.min(...xs);
}

function max(values) {
  const xs = finite(values);
  return xs.length === 0 ? null : Math.max(...xs);
}

function round(value, digits = 4) {
  return value === null ? null : Number(value.toFixed(digits));
}

function pathLength(entries) {
  let total = 0;
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1];
    const curr = entries[i];
    total += Math.hypot(curr.x - prev.x, curr.z - prev.z);
  }
  return total;
}

function maxWheelTemperature(entries) {
  return max(entries.flatMap((entry) => entry.wheelTemperature ?? []));
}

function summarize(payload, file) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const last = entries.at(-1);
  return {
    file,
    schemaVersion: payload.schemaVersion ?? null,
    appVersion: payload.appVersion ?? null,
    modelVersion: payload.modelVersion ?? null,
    scenarioId: payload.scenarioId ?? 'unknown',
    seed: payload.seed ?? null,
    status: payload.status ?? 'unknown',
    elapsedSec: round(payload.elapsedSec ?? last?.t ?? null, 3),
    sampleCount: entries.length,
    pathLengthM: round(pathLength(entries), 3),
    avgSpeedMps: round(avg(entries.map((entry) => entry.speed)), 3),
    maxSpeedMps: round(max(entries.map((entry) => entry.speed)), 3),
    avgBatteryCurrentA: round(avg(entries.map((entry) => entry.batteryCurrent)), 3),
    minBatteryVoltageLoadV: round(min(entries.map((entry) => entry.batteryVoltageLoad)), 3),
    endBatterySoc: round(last?.batterySoc ?? null, 4),
    maxWheelTemperatureC: round(maxWheelTemperature(entries), 2),
    maxBatteryTemperatureC: round(max(entries.map((entry) => entry.batteryTemperature)), 2),
    maxSpinnerRpm: round(max(entries.map((entry) => entry.spinnerRpm)), 1),
    robotDamage: round(max(entries.map((entry) => entry.robotDamage ?? entry.arenaDamage)), 2),
    minRobotHealth: round(min(entries.map((entry) => entry.robotHealth)), 2),
    finalMetricValue: round(payload.metricValue ?? last?.metricValue ?? null, 4),
    verificationPassed: payload.verification?.passed ?? null,
    verificationScore: round(payload.verification?.score ?? null, 3),
  };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  usage();
} else {
  const summaries = files.map((file) => {
    const payload = JSON.parse(readFileSync(file, 'utf8'));
    return summarize(payload, file);
  });
  console.log(JSON.stringify(summaries, null, 2));
}

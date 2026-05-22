import {
  add,
  dist,
  fmt,
  KNOWN_SCENARIOS,
  lastEvent,
  maxValue,
  minDistanceTo,
  num,
  pickTarget,
  result,
  summarize,
} from './scenario-log-core.mjs';
import { verifyObstacleAvoidance } from './scenario-log-obstacles.mjs';

const SPINNER_WEAPON_REACH_M = 0.58;
const SPINNER_IMPACT_RADIUS_M = 0.45;
const SCENARIO_LOG_SAMPLE_TOLERANCE_M = 0.05;
const SPINNER_MAX_CHASSIS_TARGET_DIST_M =
  SPINNER_WEAPON_REACH_M + SPINNER_IMPACT_RADIUS_M + SCENARIO_LOG_SAMPLE_TOLERANCE_M;
const SPINNER_IMPACT_RPM = 2800;
const SPINNER_IMPACT_SPEED_MPS = 0.45;
const TARGET_X = 2.4;
const TARGET_Z = 0;

export function verifyScenarioPayload(payload) {
  const stats = summarize(payload.entries);
  const checks = [];
  const commandResponseMin = payload.scenarioId === 'brownoutDischarge' ? 0.15 : 0.5;
  add(
    checks,
    'scenario.known',
    KNOWN_SCENARIOS.has(payload.scenarioId),
    payload.scenarioId,
    'known id',
  );
  add(checks, 'log.samples', stats.sampleCount >= 3, stats.sampleCount, '>= 3');
  add(
    checks,
    'pilot.active',
    stats.pilotActiveRatio >= 0.35,
    fmt(stats.pilotActiveRatio),
    '>= 0.35',
  );
  add(
    checks,
    'command.response',
    stats.commandResponseRatio >= commandResponseMin,
    fmt(stats.commandResponseRatio),
    `>= ${fmt(commandResponseMin)}`,
  );
  add(
    checks,
    'embedded.verification',
    payload.verification?.passed === true,
    payload.verification?.passed ?? false,
    'embedded verification passed',
  );
  verifySpecific(payload, stats, checks);
  return result(payload, stats, checks);
}

function verifySpecific(payload, stats, checks) {
  const scenario = payload.scenarioId;
  if (scenario === 'figureEight') return verifyFigureEight(payload, stats, checks);
  if (scenario === 'obstacleAvoidance') return verifyObstacleAvoidance(payload, stats, checks);
  if (scenario === 'searchAndStrike') verifyTarget(payload, stats, checks, 'search');
  if (scenario === 'fsmVsBt') verifyTarget(payload, stats, checks, 'fsmBt');
  if (scenario === 'spinnerImpact') verifySpinner(payload, stats, checks);
  if (scenario === 'madgwickVsComplementary') verifyMadgwick(payload, checks);
  if (scenario === 'brownoutDischarge') verifyBrownout(payload, stats, checks);
}

function verifyFigureEight(payload, stats, checks) {
  const collisions = lastEvent(payload.entries, 'collisions');
  add(checks, 'status.completed', payload.status === 'completed', payload.status, 'completed');
  add(checks, 'figure.duration', payload.elapsedSec >= 25, fmt(payload.elapsedSec), '>= 25 с');
  add(checks, 'figure.path', stats.pathLengthM >= 7, fmt(stats.pathLengthM), '>= 7 м');
  add(
    checks,
    'figure.coverage',
    stats.xMin <= -1.2 && stats.xMax >= 1.2 && stats.zMin <= -0.45 && stats.zMax >= 0.45,
    { x: [fmt(stats.xMin), fmt(stats.xMax)], z: [fmt(stats.zMin), fmt(stats.zMax)] },
    'both loops',
  );
  add(
    checks,
    'figure.return',
    dist(stats.endX, stats.endZ, 0, 0) <= 1.05,
    fmt(dist(stats.endX, stats.endZ, 0, 0)),
    '<= 1.05 м',
  );
  add(checks, 'figure.collisions', collisions === 0, collisions, '= 0');
}

function verifyTarget(payload, stats, checks, prefix) {
  const target = pickTarget(payload.seed);
  const startDist = dist(stats.startX, stats.startZ, target.x, target.z);
  const minDist = minDistanceTo(payload.entries, target.x, target.z);
  const hit = lastEvent(payload.entries, 'targetHit');
  add(checks, 'status.completed', payload.status === 'completed', payload.status, 'completed');
  add(checks, `${prefix}.targetHit`, hit > 0, hit, '> 0');
  add(checks, `${prefix}.approach`, startDist - minDist >= 2, fmt(startDist - minDist), '>= 2 м');
  add(checks, `${prefix}.nearTarget`, minDist <= 1.0, fmt(minDist), '<= 1.0 м');
  add(
    checks,
    `${prefix}.path`,
    stats.pathLengthM >= Math.max(1.5, startDist - 1.2),
    fmt(stats.pathLengthM),
    `>= ${fmt(Math.max(1.5, startDist - 1.2))} м`,
  );
  if (payload.scenarioId === 'fsmVsBt') {
    add(
      checks,
      'fsmBt.mode',
      [1, 2].includes(num(payload.summary?.mode)),
      payload.summary?.mode ?? 0,
      '1|2',
    );
    add(
      checks,
      'fsmBt.tToHit',
      num(payload.summary?.t_to_hit_sec, -1) > 0,
      fmt(num(payload.summary?.t_to_hit_sec, -1)),
      '> 0 с',
    );
  }
}

function verifySpinner(payload, stats, checks) {
  const maxSpinnerRpm = Math.max(
    maxValue(payload.entries, (entry) => Math.abs(entry.spinnerRpm ?? 0)),
    num(payload.summary?.spinner_peak_rpm),
  );
  const startDist = dist(stats.startX, stats.startZ, TARGET_X, TARGET_Z);
  const minDist = minDistanceTo(payload.entries, TARGET_X, TARGET_Z);
  const hit = lastEvent(payload.entries, 'armorHit');
  const impactRpm = lastEvent(payload.entries, 'impact_rpm');
  const impactSpeed = lastEvent(payload.entries, 'impact_speed_mps');
  const energy = lastEvent(payload.entries, 'impact_energy_j');
  add(checks, 'status.completed', payload.status === 'completed', payload.status, 'completed');
  add(checks, 'spinner.spinup', maxSpinnerRpm >= 3000, fmt(maxSpinnerRpm, 0), '>= 3000 об/мин');
  add(
    checks,
    'spinner.targetApproach',
    startDist - minDist >= 2,
    fmt(startDist - minDist),
    '>= 2 м',
  );
  add(
    checks,
    'spinner.nearTarget',
    minDist <= SPINNER_MAX_CHASSIS_TARGET_DIST_M,
    fmt(minDist),
    `<= ${SPINNER_MAX_CHASSIS_TARGET_DIST_M} м`,
  );
  add(checks, 'spinner.armorHit', hit > 0, hit, '> 0');
  add(
    checks,
    'spinner.impactRpm',
    impactRpm >= SPINNER_IMPACT_RPM,
    fmt(impactRpm, 0),
    `>= ${SPINNER_IMPACT_RPM} об/мин`,
  );
  add(
    checks,
    'spinner.impactSpeed',
    impactSpeed >= SPINNER_IMPACT_SPEED_MPS,
    fmt(impactSpeed),
    `>= ${SPINNER_IMPACT_SPEED_MPS} м/с`,
  );
  add(checks, 'spinner.impactEnergy', energy >= 6000, fmt(energy, 0), '>= 6000 Дж');
  add(checks, 'spinner.robotPath', stats.pathLengthM >= 2, fmt(stats.pathLengthM), '>= 2 м');
}

function verifyMadgwick(payload, checks) {
  const summary = payload.summary ?? {};
  add(checks, 'status.completed', payload.status === 'completed', payload.status, 'completed');
  add(checks, 'madgwick.samples', num(summary.samples) >= 300, summary.samples ?? 0, '>= 300');
  add(
    checks,
    'madgwick.yawRange',
    num(summary.yaw_range_deg) >= 180,
    fmt(num(summary.yaw_range_deg), 1),
    '>= 180°',
  );
  add(
    checks,
    'madgwick.beatsComplementary',
    num(summary.rmse_yaw_complementary_deg) >
      num(summary.rmse_yaw_madgwick_deg, Number.POSITIVE_INFINITY),
    `${fmt(num(summary.rmse_yaw_complementary_deg), 2)} > ${fmt(num(summary.rmse_yaw_madgwick_deg), 2)}`,
    'RMSE complementary > RMSE Madgwick',
  );
  add(
    checks,
    'madgwick.ratio',
    num(summary.ratio_comp_over_madgwick) >= 1.5,
    fmt(num(summary.ratio_comp_over_madgwick)),
    '>= 1.5',
  );
}

function verifyBrownout(payload, stats, checks) {
  const summary = payload.summary ?? {};
  add(checks, 'status.completed', payload.status === 'completed', payload.status, 'completed');
  add(checks, 'brownout.samples', num(summary.samples) >= 300, summary.samples ?? 0, '>= 300');
  add(checks, 'brownout.path', stats.pathLengthM >= 8, fmt(stats.pathLengthM), '>= 8 м');
  add(
    checks,
    'brownout.voltageDrop',
    num(summary.min_v_load_v, 100) < 36,
    fmt(num(summary.min_v_load_v)),
    '< 36 В',
  );
  add(
    checks,
    'brownout.scale',
    num(summary.min_brownout_scale, 1) < 1,
    fmt(num(summary.min_brownout_scale, 1)),
    '< 1',
  );
  add(
    checks,
    'brownout.soc',
    num(summary.final_soc, 1) < 0.3,
    fmt(num(summary.final_soc, 0)),
    '< 0.30',
  );
}

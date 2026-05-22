import { MAX_CHASSIS_TARGET_DIST_M } from '../../spinnerImpactConfig.ts';
import { dist, fmt, lastEvent, maxValue, minDistanceTo } from '../math.ts';
import type { CheckDraft, ScenarioVerificationPayload, TraceStats } from '../types.ts';
import { pushCheck } from './common.ts';

export function verifySpinnerImpact(
  payload: ScenarioVerificationPayload,
  stats: TraceStats,
  checks: CheckDraft[],
): void {
  const hit = lastEvent(payload.entries, 'armorHit');
  const impactRpm = lastEvent(payload.entries, 'impact_rpm');
  const impactSpeed = lastEvent(payload.entries, 'impact_speed_mps');
  const impactEnergy = lastEvent(payload.entries, 'impact_energy_j');
  const maxSpinnerRpm = Math.max(
    maxValue(payload.entries, (entry) => Math.abs(entry.spinnerRpm)),
    payload.summary?.spinner_peak_rpm ?? 0,
  );
  const startDist = dist(stats.startX, stats.startZ, 2.4, 0);
  const minTargetDist = minDistanceTo(payload.entries, 2.4, 0);
  pushCheck(
    checks,
    'status.completed',
    'миссия завершилась ударом',
    payload.status === 'completed',
    'status=completed',
    payload.status,
  );
  pushCheck(
    checks,
    'spinner.spinup',
    'ротор реально раскрутился',
    maxSpinnerRpm >= 3000,
    'max spinnerRpm ≥ 3000 об/мин',
    `${fmt(maxSpinnerRpm, 0)} об/мин`,
  );
  pushCheck(
    checks,
    'spinner.targetApproach',
    'робот сократил дистанцию до бронепанели',
    startDist - minTargetDist >= 2,
    'distStart − distMin ≥ 2 м',
    `${fmt(startDist - minTargetDist)} м`,
  );
  pushCheck(
    checks,
    'spinner.nearTarget',
    'траектория дошла до зоны удара',
    minTargetDist <= MAX_CHASSIS_TARGET_DIST_M,
    `minDist(target) ≤ ${fmt(MAX_CHASSIS_TARGET_DIST_M)} м`,
    `${fmt(minTargetDist)} м`,
  );
  pushCheck(
    checks,
    'spinner.armorHit',
    'зафиксирован удар по бронепанели',
    hit > 0,
    'armorHit > 0',
    `${hit}`,
  );
  pushCheck(
    checks,
    'spinner.impactRpm',
    'удар нанесён раскрученным оружием',
    impactRpm >= 2800,
    'impact_rpm ≥ 2800 об/мин',
    `${fmt(impactRpm, 0)} об/мин`,
  );
  pushCheck(
    checks,
    'spinner.impactSpeed',
    'удар сопровождался движением робота',
    impactSpeed >= 0.45,
    'impact_speed ≥ 0.45 м/с',
    `${fmt(impactSpeed)} м/с`,
  );
  pushCheck(
    checks,
    'spinner.impactEnergy',
    'энергия ротора достаточна для боевого контакта',
    impactEnergy >= 6000,
    'impact_energy ≥ 6000 Дж',
    `${fmt(impactEnergy, 0)} Дж`,
  );
  pushCheck(
    checks,
    'spinner.robotPath',
    'робот выполнил боевой заход, а не стоял',
    stats.pathLengthM >= 2,
    'robot path ≥ 2 м',
    `${fmt(stats.pathLengthM)} м`,
  );
}

export function verifyMadgwick(payload: ScenarioVerificationPayload, checks: CheckDraft[]): void {
  const s = payload.summary ?? {};
  pushCheck(
    checks,
    'status.completed',
    'эксперимент штатно завершил окно измерения',
    payload.status === 'completed',
    'status=completed',
    payload.status,
  );
  pushCheck(
    checks,
    'madgwick.samples',
    'накоплено достаточно IMU-сэмплов',
    (s.samples ?? 0) >= 300,
    'samples ≥ 300',
    `${fmt(s.samples ?? 0, 0)}`,
  );
  pushCheck(
    checks,
    'madgwick.yawRange',
    'программа дала информативный yaw',
    (s.yaw_range_deg ?? 0) >= 180,
    'yaw_range ≥ 180°',
    `${fmt(s.yaw_range_deg ?? 0, 1)}°`,
  );
  pushCheck(
    checks,
    'madgwick.beatsComplementary',
    'Маджвик лучше комплементарного фильтра без рыскания',
    (s.rmse_yaw_complementary_deg ?? 0) > (s.rmse_yaw_madgwick_deg ?? Number.POSITIVE_INFINITY),
    'RMSE complementary > RMSE Madgwick',
    `${fmt(s.rmse_yaw_complementary_deg ?? 0, 2)}° > ${fmt(s.rmse_yaw_madgwick_deg ?? 0, 2)}°`,
  );
  pushCheck(
    checks,
    'madgwick.ratio',
    'разница фильтров выражена численно',
    (s.ratio_comp_over_madgwick ?? 0) >= 1.5,
    'ratio ≥ 1.5',
    `${fmt(s.ratio_comp_over_madgwick ?? 0, 2)}`,
  );
}

export function verifyBrownout(
  payload: ScenarioVerificationPayload,
  stats: TraceStats,
  checks: CheckDraft[],
): void {
  const s = payload.summary ?? {};
  pushCheck(
    checks,
    'status.completed',
    'эксперимент штатно завершил окно измерения',
    payload.status === 'completed',
    'status=completed',
    payload.status,
  );
  pushCheck(
    checks,
    'brownout.samples',
    'энергомодель считалась весь прогон',
    (s.samples ?? 0) >= 300,
    'samples ≥ 300',
    `${fmt(s.samples ?? 0, 0)}`,
  );
  pushCheck(
    checks,
    'brownout.path',
    'робот создавал нагрузку движением',
    stats.pathLengthM >= 8,
    'path ≥ 8 м',
    `${fmt(stats.pathLengthM)} м`,
  );
  pushCheck(
    checks,
    'brownout.voltageDrop',
    'напряжение под нагрузкой просело',
    (s.min_v_load_v ?? 100) < 36,
    'min V_load < 36 В',
    `${fmt(s.min_v_load_v ?? 0, 2)} В`,
  );
  pushCheck(
    checks,
    'brownout.scale',
    'коэффициент просадки реально ограничивал скважность',
    (s.min_brownout_scale ?? 1) < 1,
    'min scale < 1',
    `${fmt(s.min_brownout_scale ?? 1, 3)}`,
  );
  pushCheck(
    checks,
    'brownout.soc',
    'SOC уменьшился относительно 30%',
    (s.final_soc ?? 1) < 0.3,
    'final SOC < 0.30',
    `${fmt(s.final_soc ?? 0, 4)}`,
  );
}

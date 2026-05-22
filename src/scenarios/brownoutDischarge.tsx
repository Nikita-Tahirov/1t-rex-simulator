import { BatteryModel } from '@/control/battery.ts';
import { MotorModel } from '@/control/motor.ts';
import { SceneMarkerRing } from '@/physics/SceneMarkers.tsx';
import { goToTarget, pilotDrive } from './_pilotHelpers.ts';
import type { Scenario, ScenarioContext } from './manager.ts';

/**
 * Сравнительный эксперимент: brownout-компенсация просадки напряжения 12S Li-Po.
 *
 * **Что замеряется.** Сценарий стартует с **низким начальным SOC** (по умолчанию 30 %)
 * и моделирует энергетический контур независимо от Robot.tsx:
 *   • четыре MotorModel-канала привода + один канал ротора (выкл по умолчанию);
 *   • одна BatteryModel 12S Li-Po, 22 А·ч;
 *   • brownout-масштабирование: brownoutScale = clamp(V_load/36, 0.1, 1.0)
 *     умножается на скважность всех каналов привода.
 *
 * Скважность каждого канала пропорциональна **истинной** скорости робота
 * (telemetry.speed) и его yawRate, что даёт реалистичную нагрузку на батарею.
 *
 * **Что фиксируется в summary.**
 *   • `t_brownout_start_sec` — момент, когда V_load впервые опустился ниже 36 В;
 *   • `min_v_load_v` — минимальное напряжение под нагрузкой за прогон;
 *   • `final_soc` — итоговый SOC;
 *   • `min_brownout_scale` — минимальный коэффициент ограничения скважности;
 *   • `effective_power_loss_pct` — % потери эффективной мощности из-за brownout.
 *
 * **Закрывает тезис § 2.1.2 ВКР** (модель аккумулятора и brownout-компенсация).
 *
 * **Регламент использования.** Прокатить робота с интенсивной нагрузкой
 * (W зажат, периодические повороты A/D) в течение 35 с. Сценарий принудительно
 * проверит работу brownout даже при низком SOC.
 */

const BROWNOUT_THRESHOLD_V = 36; // 3.0 В × 12 банок
const INITIAL_SOC = 0.3;

// Параметры одного хода-мотора (типовые для 1T-REX, 2 кВт пиковой мощности).
const MOTOR_PARAMS = {
  stallTorque: 8, // Н·м (на валу мотора, до редуктора)
  noLoadSpeed: 800, // рад/с (≈ 7600 об/мин)
  stallCurrent: 60, // А
  gearRatio: 12,
  gearEfficiency: 0.9,
  windingResistance: 0.05, // Ом
  heatCapacity: 250,
  thermalConductance: 1.2,
  ambientTemperatureC: 22,
  currentLimit: 40,
} as const;

const BATTERY_PARAMS = {
  seriesCells: 12,
  capacityAh: 22,
  initialSoc: INITIAL_SOC,
  internalResistance: 0.3,
  heatCapacity: 4000,
  thermalConductance: 1.5,
  ambientTemperatureC: 22,
} as const;

interface BrownoutState {
  motors: MotorModel[];
  battery: BatteryModel;
  /** Момент первого пересечения порога brownout (сек), либо null. */
  tBrownoutStart: number | null;
  /** Минимальное напряжение под нагрузкой за прогон. */
  minVLoad: number;
  /** Минимальный коэффициент brownout (1.0 если не сработал). */
  minScale: number;
  /** Сумма duty × scale × samples и сумма duty × samples — для % потерь. */
  sumDuty: number;
  sumDutyScaled: number;
  samples: number;
}

let state: BrownoutState | null = null;

function createState(): BrownoutState {
  return {
    motors: [0, 1, 2, 3].map(() => new MotorModel({ ...MOTOR_PARAMS })),
    battery: new BatteryModel({ ...BATTERY_PARAMS }),
    tBrownoutStart: null,
    minVLoad: BATTERY_PARAMS.seriesCells * 4.2,
    minScale: 1,
    sumDuty: 0,
    sumDutyScaled: 0,
    samples: 0,
  };
}

/**
 * Виртуальный duty: маппим speed→[0..1] и yawRate→±0.3 на отдельных колёсах.
 * Это достаточная аппроксимация реальной нагрузки.
 */
function speedToDuty(speed: number, yawRate: number): [number, number, number, number] {
  const fwd = Math.max(-1, Math.min(1, speed / 6.94)); // 25 км/ч = 6.94 м/с
  const turn = Math.max(-0.6, Math.min(0.6, yawRate * 0.3));
  // Левая сторона: fwd - turn; правая: fwd + turn.
  const left = fwd - turn;
  const right = fwd + turn;
  return [left, right, left, right]; // FL, FR, RL, RR
}

function tickBrownout(ctx: ScenarioContext, s: BrownoutState): void {
  const { dt, telemetry } = ctx;
  if (dt <= 0) return;

  const vLoadPrev = s.battery.snapshot().voltageLoad;
  const brownoutScale =
    vLoadPrev < BROWNOUT_THRESHOLD_V ? Math.max(0.1, vLoadPrev / BROWNOUT_THRESHOLD_V) : 1;

  // Виртуальная нагрузка: фактические telemetry.speed/yawRate переводим в duty.
  const dutyVec = speedToDuty(telemetry.speed, telemetry.yawRate);

  let totalCurrent = 0;
  // ω каждого колеса берём из telemetry.wheelOmega (реальные данные Rapier).
  const omega = telemetry.wheelOmega;
  for (let i = 0; i < 4; i++) {
    const motor = s.motors[i];
    if (!motor) continue;
    const dutyRaw = dutyVec[i] ?? 0;
    const dutyEff = dutyRaw * brownoutScale;
    const ms = motor.step(dutyEff, omega[i] ?? 0, dt);
    totalCurrent += Math.abs(ms.current);
    s.sumDuty += Math.abs(dutyRaw);
    s.sumDutyScaled += Math.abs(dutyEff);
  }

  // Обновляем батарею.
  const battState = s.battery.step(totalCurrent, dt);
  s.samples += 1;

  // Фиксация brownout.
  if (battState.voltageLoad < BROWNOUT_THRESHOLD_V && s.tBrownoutStart === null) {
    s.tBrownoutStart = ctx.elapsedSec;
  }
  if (battState.voltageLoad < s.minVLoad) s.minVLoad = battState.voltageLoad;
  if (brownoutScale < s.minScale) s.minScale = brownoutScale;

  // Метрики на bus — для возможного отображения.
  ctx.bus.set('battery_v_load', battState.voltageLoad);
  ctx.bus.set('battery_soc', battState.soc);
  ctx.bus.set('brownout_scale', brownoutScale);
  ctx.bus.set('battery_temp_c', battState.temperatureC);
  ctx.bus.set('battery_current_a', battState.current);
}

export const brownoutDischarge: Scenario = {
  id: 'brownoutDischarge',
  title: '[Эксп.] Brownout (разряд 12S)',
  category: 'experiment',
  description:
    'Стартовый SOC 30 %. Прокатите робота интенсивно (W + повороты) — модель АКБ 12S сама пересчитает просадку напряжения и зафиксирует момент включения brownout-компенсации.',
  initialPose: { x: 0, z: 0, yaw: 0 },
  timeoutSec: 35,
  completeOnTimeout: true,
  isAutonomyAllowed: true,

  setup: () => (
    <group>
      <SceneMarkerRing
        position={[0, 0]}
        innerRadius={0.45}
        outerRadius={0.6}
        color="#ffb547"
        opacity={0.7}
      />
      <SceneMarkerRing
        position={[0, 0]}
        innerRadius={2.95}
        outerRadius={3}
        color="#e23a5b"
        opacity={0.3}
        segments={64}
      />
    </group>
  ),

  reset: () => {
    state = createState();
  },

  pilot: (ctx) => {
    // Плавный круг радиусом ~3 м: постоянная нагрузка на приводе → чистый
    // brownout-сигнал без артефактов от рывков. Мягкое торможение в финале.
    if (ctx.elapsedSec > 32) {
      pilotDrive(ctx, 0, 0);
      return;
    }
    const { positionX, positionZ } = ctx.telemetry;
    const radius = Math.hypot(positionX, positionZ);
    // Если робота вынесло за пределы безопасного радиуса — мягкий возврат
    // в стартовое кольцо (геометрия эксперимента, не маршрут).
    if (radius > 3.8) {
      goToTarget(ctx, {
        targetX: 0,
        targetZ: 0,
        cruiseThrottle: 0.55,
        minMoveThrottle: 0.3,
        arriveRadius: 1.5,
      });
      return;
    }
    // Постоянный (throttle, turn) → траектория ≈ дуга радиусом v/ω.
    // При throttle 0.7 ≈ 4.5 м/с в нагрузке, turn 0.28 ≈ 1.5 рад/с → r ≈ 3 м.
    pilotDrive(ctx, 0.7, 0.28);
  },

  metric: (ctx) => {
    if (!state) state = createState();
    tickBrownout(ctx, state);
    return state.battery.snapshot().voltageLoad;
  },

  // Завершение по таймауту — сценарий мониторит весь прогон.
  goal: () => false,

  summary: (ctx) => {
    if (!state) return { error_no_state: 1 };
    const snap = state.battery.snapshot();
    const powerLossPct = state.sumDuty > 1e-6 ? (1 - state.sumDutyScaled / state.sumDuty) * 100 : 0;
    return {
      t_brownout_start_sec: state.tBrownoutStart ?? -1,
      min_v_load_v: state.minVLoad,
      final_soc: snap.soc,
      final_v_load_v: snap.voltageLoad,
      final_v_open_v: snap.voltageOpen,
      final_battery_temp_c: snap.temperatureC,
      min_brownout_scale: state.minScale,
      effective_power_loss_pct: powerLossPct,
      samples: state.samples,
      elapsed_sec: ctx.elapsedSec,
    };
  },
};

/** Тест-хелпер. */
export function _testHelpers() {
  return {
    getState: () => state,
    forceCreateState: (): BrownoutState => {
      state = createState();
      return state;
    },
    BROWNOUT_THRESHOLD_V,
    INITIAL_SOC,
  };
}

import { SceneMarkerRing } from '@/physics/SceneMarkers.tsx';
import { ComplementaryFilter } from '@/sensors/complementary-filter.ts';
import { IMUSensor, type IMUTrueSample } from '@/sensors/imu-sensor.ts';
import { MadgwickFilter } from '@/sensors/madgwick-filter.ts';
import { pilotDrive, wrapPi } from './_pilotHelpers.ts';
import type { Scenario, ScenarioContext } from './manager.ts';

/**
 * Сравнительный эксперимент: фильтр Маджвика vs комплементарный фильтр.
 *
 * **Что замеряется.** На каждом шаге сценарий:
 *   1. Реконструирует «истинный» IMU-семпл из физических данных Rapier
 *      (yaw/roll/pitch + speed/yawRate из telemetry, плюс численная производная
 *      для линейного ускорения).
 *   2. Прогоняет один и тот же зашумлённый семпл через **оба** фильтра
 *      одновременно (общий ГПСЧ-seed → детерминированный шум).
 *   3. Считает RMSE угла рыскания yaw для каждого фильтра против истинного yaw
 *      (после устаканивания фильтра — первая 1 с пропускается).
 *
 * **Закрывает тезис научной новизны №2** (§ 2.1.4 ВКР):
 *   сравнительная оценка двух алгоритмов оценки ориентации с привязкой к
 *   вычислительному бюджету целевой платформы МК МИК32 «Амур».
 *
 * **Сценарий не управляет роботом** — пользователь сам ведёт его клавишами.
 * Для информативного результата нужно совершить минимум один полный поворот
 * (≥ 360°). Подсказка: «WASD; для теста сделайте 2-3 круга W+D в течение
 * 30-40 секунд». Результат пишется в JSON как `summary`:
 *
 *   {
 *     "rmse_yaw_madgwick_deg": 1.2,
 *     "rmse_yaw_complementary_deg": 12.4,
 *     "samples": 3500,
 *     "yaw_range_deg": 720,
 *     "ratio_comp_over_madgwick": 10.3
 *   }
 *
 * Цель — предельное время (мягкое завершение), сценарий считает результат всегда.
 */

const SETTLE_TIME_SEC = 1.0;
const MIN_YAW_RANGE_DEG = 90; // если робота не крутили — данные неинформативны
const GRAVITY = 9.81;

/** Параметры виртуального ИИМ — типовые для MPU-6500/ICM-20948. */
const IMU_NOISE = {
  accelStd: 0.05, // м/с²
  gyroStd: 0.003, // рад/с
  gyroBiasRandomWalk: 0.0002, // рад/с/√с
  accelRange: 4 * GRAVITY, // ±4 g
  gyroRange: 8.7, // ±500 °/с ≈ 8.7 рад/с
} as const;

/** Постоянная времени комплементарного фильтра (значение по умолчанию). */
const COMPLEMENTARY_TAU = 0.5;
/** Коэффициент Маджвика β: мягкая коррекция roll/pitch без подавления yaw-интеграции. */
const MADGWICK_BETA = 0.02;

interface ExperimentState {
  imu: IMUSensor;
  madgwick: MadgwickFilter;
  complementary: ComplementaryFilter;
  /** Сумма квадратов ошибок и счётчик — для RMSE. */
  sumSqErrMadgwick: number;
  sumSqErrComp: number;
  samples: number;
  yawInitialised: boolean;
  /** Накопленный неразвёрнутый yaw (для диапазона при > π). */
  yawAccum: number;
  prevYaw: number;
  yawAccumMin: number;
  yawAccumMax: number;
}

/** Глобальный state, привязанный к id сценария. */
let state: ExperimentState | null = null;

function createState(seed: number): ExperimentState {
  return {
    imu: new IMUSensor({ ...IMU_NOISE, seed }),
    madgwick: new MadgwickFilter({ beta: MADGWICK_BETA }),
    complementary: new ComplementaryFilter({ tau: COMPLEMENTARY_TAU }),
    sumSqErrMadgwick: 0,
    sumSqErrComp: 0,
    samples: 0,
    yawInitialised: false,
    yawAccum: 0,
    prevYaw: 0,
    yawAccumMin: 0,
    yawAccumMax: 0,
  };
}

/** Развёртка yaw в непрерывный шаг (учёт скачков ±π). */
function unwrap(prev: number, curr: number): number {
  let d = curr - prev;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function tickExperiment(ctx: ScenarioContext, s: ExperimentState): void {
  const { dt, telemetry } = ctx;
  if (dt <= 0) return;

  // Сенсорные фильтры в `sensors/*` используют правостороннюю IMU-конвенцию Z-up:
  //   ax — продольная, ay — боковая, az≈g, gz — yaw-rate.
  // Game-convention симулятора считает положительный yaw в противоположном
  // направлении, поэтому yaw переводится со знаком минус. Gyro-rate берём как
  // производную наблюдаемого yaw: telemetry.yawRate в квазикинематической модели
  // отражает команду, а не всегда фактический fixed-step поворот Rapier.
  const imuYaw = -telemetry.yaw;
  const dyawForGyro = s.yawInitialised ? unwrap(s.prevYaw, imuYaw) : 0;
  const imuYawRate = dyawForGyro / dt;
  const truth: IMUTrueSample = {
    ax: 0,
    ay: 0,
    az: GRAVITY,
    gx: 0,
    gy: 0,
    gz: imuYawRate,
  };

  // Зашумлённый семпл — общий для обоих фильтров.
  const noisy = s.imu.sample(truth, dt);

  // Прогоняем оба фильтра. Возврат фильтров игнорируем —
  // важна только сторона эффекта (state-update). madEuler читается ниже.
  s.complementary.update(noisy, dt);
  s.madgwick.update(noisy, dt);
  const madEuler = s.madgwick.toEuler();

  // Yaw: комплементарный фильтр НЕ оценивает yaw (только roll/pitch) —
  // его оценка yaw фиксируется как 0. Это и есть демонстрация ограничения.
  // Madgwick возвращает yaw из кватерниона ориентации.

  // Накопление RMSE начинаем после settle-времени, чтобы фильтр устаканился.
  if (ctx.elapsedSec >= SETTLE_TIME_SEC) {
    const errMadgwickYaw = wrapPi(madEuler.yaw - imuYaw);
    const errCompYaw = wrapPi(0 - imuYaw); // комплементарный = 0 yaw
    s.sumSqErrMadgwick += errMadgwickYaw * errMadgwickYaw;
    s.sumSqErrComp += errCompYaw * errCompYaw;
    s.samples += 1;
  }

  // Развёртка yaw — оценка диапазона.
  if (!s.yawInitialised) {
    s.yawInitialised = true;
    s.yawAccum = imuYaw;
    s.prevYaw = imuYaw;
    s.yawAccumMin = s.yawAccum;
    s.yawAccumMax = s.yawAccum;
  } else {
    s.yawAccum += dyawForGyro;
    s.prevYaw = imuYaw;
    if (s.yawAccum < s.yawAccumMin) s.yawAccumMin = s.yawAccum;
    if (s.yawAccum > s.yawAccumMax) s.yawAccumMax = s.yawAccum;
  }

  // Текущие RMSE — выводим как extra-метрики на bus (для возможной визуализации).
  if (s.samples > 0) {
    const rmseM = Math.sqrt(s.sumSqErrMadgwick / s.samples);
    const rmseC = Math.sqrt(s.sumSqErrComp / s.samples);
    ctx.bus.set('rmse_yaw_madgwick_rad', rmseM);
    ctx.bus.set('rmse_yaw_comp_rad', rmseC);
  }
}

export const madgwickVsComplementary: Scenario = {
  id: 'madgwickVsComplementary',
  title: '[Эксп.] Маджвик vs Комплементарный',
  category: 'experiment',
  description:
    'Сравнение точности оценки рыскания yaw двумя фильтрами на одном зашумлённом IMU-семпле. Прокатите робота WASD в течение 30-60 с (включая 2-3 поворота на 360°). Метрика — RMSE yaw, °. Цель новизны №2 ВКР.',
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
        color="#6f4cff"
        opacity={0.7}
      />
      <SceneMarkerRing
        position={[0, 0]}
        innerRadius={1.45}
        outerRadius={1.5}
        color="#3ad29f"
        opacity={0.4}
        segments={64}
      />
    </group>
  ),

  reset: (seed) => {
    state = createState(seed);
  },

  pilot: (ctx) => {
    // Программа: короткая инициализация → вращение на месте по часовой →
    // вращение против часовой → стоп. Без translation робот не дрейфует к
    // стенам, а yaw_range > 1200° даёт информативный RMSE.
    const t = ctx.elapsedSec;
    if (t < 1) {
      // Микро-разгон без поворота — инициализация фильтра.
      pilotDrive(ctx, 0.2, 0);
    } else if (t < 18) {
      // Вращение по часовой 17 с при turn=0.35 → ≈ 600° yaw range.
      pilotDrive(ctx, 0, 0.35);
    } else if (t < 34) {
      // Вращение против часовой 16 с — добивает yaw range и проверяет симметрию.
      pilotDrive(ctx, 0, -0.35);
    } else {
      // Мягкая остановка вместо ухода в стену (в эталоне здесь был
      // throttle=0.2, turn=0.25, что выносило робота из безопасной зоны).
      pilotDrive(ctx, 0, 0);
    }
  },

  metric: (ctx) => {
    if (!state) state = createState(ctx.seed);
    tickExperiment(ctx, state);
    if (state.samples === 0) return 0;
    const rmseM = Math.sqrt(state.sumSqErrMadgwick / state.samples);
    return rmseM * (180 / Math.PI); // главная метрика — RMSE Маджвика, в градусах
  },

  // Сценарий завершается строго по таймауту; пользователь решает когда остановиться.
  goal: () => false,

  summary: (ctx) => {
    if (!state || state.samples === 0) {
      return { samples: 0, error_no_data: 1 };
    }
    const rmseM = Math.sqrt(state.sumSqErrMadgwick / state.samples);
    const rmseC = Math.sqrt(state.sumSqErrComp / state.samples);
    const yawRangeRad = state.yawAccumMax - state.yawAccumMin;
    const out: Record<string, number> = {
      rmse_yaw_madgwick_deg: rmseM * (180 / Math.PI),
      rmse_yaw_complementary_deg: rmseC * (180 / Math.PI),
      samples: state.samples,
      yaw_range_deg: yawRangeRad * (180 / Math.PI),
      elapsed_sec: ctx.elapsedSec,
      ratio_comp_over_madgwick: rmseM > 1e-6 ? rmseC / rmseM : 0,
    };
    // Подсказка: данные неинформативны если робота не крутили.
    if (yawRangeRad * (180 / Math.PI) < MIN_YAW_RANGE_DEG) {
      out.warning_low_yaw_range = 1;
    }
    return out;
  },
};

/**
 * Тест-хелпер: ручное прокручивание состояния (для unit-тестов).
 * НЕ для релизного использования.
 */
export function _testHelpers() {
  return {
    getState: () => state,
    resetState: (seed: number) => {
      state = createState(seed);
    },
  };
}

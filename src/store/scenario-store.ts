import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Стор сценариев и журнала прохождения.
 *
 * Содержит «медленное» состояние: выбранный сценарий, статус, метрика, summary.
 *
 * **Лог сценария** хранится отдельно от zustand-стора, в буфере уровня модуля
 * (`scenarioLogBuffer`). Это даёт O(1) `appendLog` (push в массив) вместо
 * O(N) копирования каждые 100 мс — критично, потому что за миссию длиной
 * 60 с накапливается ~600 записей. Логом не управляет реактивный интерфейс;
 * читается ТОЛЬКО при `exportLog()` / `downloadLog()` для скачивания.
 */

export type ScenarioStatus = 'idle' | 'running' | 'completed' | 'failed';

/** Начальная поза робота для воспроизводимого прогона сценария. */
export interface RobotResetPose {
  /** X-координата центра шасси, м */
  x: number;
  /** Z-координата центра шасси, м */
  z: number;
  /** Yaw в game-convention: 0 ↔ +X, +π/2 ↔ +Z */
  yaw: number;
}

/** Одноразовый запрос на сброс физического тела робота перед стартом сценария. */
export interface RobotResetRequest {
  id: number;
  pose: RobotResetPose;
}

/**
 * Команда автопилота. Когда `active = true`, Robot.tsx использует эти значения
 * вместо клавиатуры. Сценарии-эксперименты и автопилот базовых миссий пишут
 * сюда через `ctx.setPilotInput(...)` каждый кадр.
 *
 * @example
 *   ctx.setPilotInput({ active: true, throttle: 0.7, turn: -0.3, brake: 1 });
 */
export interface PilotInput {
  /** Если false — клавиатура управляет роботом. */
  active: boolean;
  /** Газ ∈ [-1, 1]. */
  throttle: number;
  /** Поворот ∈ [-1, 1] (правый = +1). */
  turn: number;
  /** Тормоз ∈ [0, 1]. 1 = свободно (по умолчанию), 0 = полная остановка. */
  brake: number;
}

export type CommandSource = 'keyboard' | 'scenario';

const DEFAULT_PILOT_INPUT: PilotInput = {
  active: false,
  throttle: 0,
  turn: 0,
  brake: 1,
};

/** Снимок телеметрии в одной точке времени (для офлайн-анализа). */
export interface ScenarioLogEntry {
  /** Время от старта сценария, с */
  t: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  yawRate: number;
  spinnerRpm: number;
  batterySoc: number;
  batteryVoltageLoad: number;
  batteryCurrent: number;
  batteryTemperature: number;
  wheelCurrent: [number, number, number, number];
  wheelTemperature: [number, number, number, number];
  filteredRoll: number;
  filteredPitch: number;
  filteredYaw: number;
  rangeMeters: number;
  arenaDamage: number;
  robotHealth?: number;
  robotDamage?: number;
  robotDamageLastSource?: string;
  robotDamageLastEnergyJ?: number;
  robotDamageLastForceN?: number;
  fsmState: string;
  metricValue: number;
  /** Команда автопилота, видимая Robot.tsx в этот момент. */
  pilotActive: boolean;
  pilotThrottle: number;
  pilotTurn: number;
  pilotBrake: number;
  /** Снимок событий/непрерывных метрик ScenarioEventBus. */
  events?: Record<string, number>;
}

export interface ScenarioVerificationCheck {
  id: string;
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface ScenarioVerificationResult {
  scenarioId: string;
  passed: boolean;
  score: number;
  checks: ScenarioVerificationCheck[];
  observed: Record<string, number>;
}

export interface ScenarioLogPayload {
  schemaVersion: 1;
  appVersion: string;
  modelVersion: string;
  scenarioId: string;
  seed: number;
  status: ScenarioStatus;
  /** Монотонный номер запуска; нужен React-сцене для ремоунта scenario objects. */
  runId: number;
  elapsedSec: number;
  metricValue: number;
  message: string;
  recordedAt: string;
  entries: ScenarioLogEntry[];
  /**
   * Скалярные итоговые метрики, фиксируемые сценарием на завершении
   * (Scenario.summary). Используются сравнительными экспериментами
   * (Маджвик vs Комплементарный, FSM vs BT, brownout) для одной строки
   * сводной таблицы.
   */
  summary?: Record<string, number>;
  /** Автоматическая проверка: целевое поведение ↔ фактический лог. */
  verification?: ScenarioVerificationResult;
}

/**
 * Буфер уровня модуля для записей лога. ScenarioRunner вызывает `appendLog`,
 * который делает push (O(1)). Никакого zustand-set здесь нет — интерфейс этим
 * полем не подписывается, поэтому исключение из state-tree безопасно.
 *
 * Чтение через `getScenarioLog()`. Сброс через `resetLog()` (state-action).
 */
const scenarioLogBuffer: ScenarioLogEntry[] = [];

/** Прочитать текущий снимок лога (для тестов / e2e). НЕ модифицировать. */
export function getScenarioLog(): readonly ScenarioLogEntry[] {
  return scenarioLogBuffer;
}

export interface ScenarioState {
  currentScenarioId: string;
  seed: number;
  status: ScenarioStatus;
  /** Монотонный номер запуска; нужен React-сцене для ремоунта scenario objects. */
  runId: number;
  elapsedSec: number;
  metricValue: number;
  /** Сообщение о причине failure либо описание completion */
  message: string;
  /** Финальные скалярные метрики (Scenario.summary). Пустой объект до завершения. */
  summary: Record<string, number>;
  /** Итог автоматической V&V-проверки текущего прогона. */
  verification: ScenarioVerificationResult | null;
  /** Команда автопилота сценария. По умолчанию active=false → клавиатура. */
  pilotInput: PilotInput;
  /** Кто сейчас владеет ходовыми командами Robot.tsx. */
  commandSource: CommandSource;
  /** Одноразовый запрос Robot.tsx на сброс позы при старте сценария. */
  robotResetRequest: RobotResetRequest | null;

  setCurrentScenarioId: (id: string) => void;
  setSeed: (seed: number) => void;
  setStatus: (s: ScenarioStatus) => void;
  bumpRunId: () => void;
  setElapsed: (sec: number) => void;
  setMetricValue: (v: number) => void;
  setMessage: (m: string) => void;
  /** Push log-entry в буфер уровня модуля. O(1), без zustand-set. */
  appendLog: (entry: ScenarioLogEntry) => void;
  /** Очистить буфер уровня модуля. */
  resetLog: () => void;
  setSummary: (s: Record<string, number>) => void;
  setVerification: (v: ScenarioVerificationResult | null) => void;
  setPilotInput: (p: Partial<PilotInput>) => void;
  clearPilotInput: () => void;
  setCommandSource: (source: CommandSource) => void;
  requestRobotReset: (pose: RobotResetPose) => void;

  /** Сериализация лога + метаданных в JSON Blob. */
  exportLog: () => Blob;
  /** Триггерит браузерный download через временный `<a>`. */
  downloadLog: () => void;
}

const DEFAULT_SCENARIO_ID = 'figureEight';
const DEFAULT_SEED = 20260428;
const APP_VERSION = '0.1.0';
const MODEL_VERSION = '1trex-ms-v1';

export const useScenarioStore = create<ScenarioState>()(
  subscribeWithSelector((set, get) => ({
    currentScenarioId: DEFAULT_SCENARIO_ID,
    seed: DEFAULT_SEED,
    status: 'idle',
    runId: 0,
    elapsedSec: 0,
    metricValue: 0,
    message: '',
    summary: {},
    verification: null,
    pilotInput: { ...DEFAULT_PILOT_INPUT },
    commandSource: 'keyboard',
    robotResetRequest: null,

    setCurrentScenarioId: (id) => set({ currentScenarioId: id }),
    setSeed: (seed) => set({ seed: seed >>> 0 }),
    setStatus: (status) =>
      set(
        status === 'running'
          ? { status }
          : { status, pilotInput: { ...DEFAULT_PILOT_INPUT }, commandSource: 'keyboard' },
      ),
    bumpRunId: () => set((s) => ({ runId: s.runId + 1 })),
    setElapsed: (sec) => set({ elapsedSec: sec }),
    setMetricValue: (v) => set({ metricValue: v }),
    setMessage: (m) => set({ message: m }),
    appendLog: (entry) => {
      // Push без set: подписчики на лог отсутствуют, аллокация массива не нужна.
      scenarioLogBuffer.push(entry);
    },
    resetLog: () => {
      scenarioLogBuffer.length = 0;
    },
    setSummary: (summary) => set({ summary }),
    setVerification: (verification) => set({ verification }),
    setPilotInput: (p) => set((s) => ({ pilotInput: { ...s.pilotInput, ...p } })),
    clearPilotInput: () => set({ pilotInput: { ...DEFAULT_PILOT_INPUT } }),
    setCommandSource: (commandSource) => set({ commandSource }),
    requestRobotReset: (pose) =>
      set((s) => ({
        robotResetRequest: {
          id: (s.robotResetRequest?.id ?? 0) + 1,
          pose,
        },
      })),

    exportLog: () => {
      const s = get();
      const payload: ScenarioLogPayload = {
        schemaVersion: 1,
        appVersion: APP_VERSION,
        modelVersion: MODEL_VERSION,
        scenarioId: s.currentScenarioId,
        seed: s.seed,
        status: s.status,
        runId: s.runId,
        elapsedSec: s.elapsedSec,
        metricValue: s.metricValue,
        message: s.message,
        recordedAt: new Date().toISOString(),
        entries: scenarioLogBuffer,
        ...(Object.keys(s.summary).length > 0 ? { summary: s.summary } : {}),
        ...(s.verification ? { verification: s.verification } : {}),
      };
      return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    },

    downloadLog: () => {
      const s = get();
      const blob = s.exportLog();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `1trex-${s.currentScenarioId}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  })),
);

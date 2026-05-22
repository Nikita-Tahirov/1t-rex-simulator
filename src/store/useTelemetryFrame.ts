import { useSyncExternalStore } from 'react';
import { type RobotTelemetry, telemetry } from '@/store/telemetry.ts';

/**
 * Cap UI-частоты подписчиков HUD на 30 Гц, чтобы React-дерево не реконсилировалось
 * на каждом physics-кадре (60 Гц). Все хуки этого модуля разделяют один rAF-цикл
 * и общий version-счётчик — подписчики просыпаются ≤30 раз/с независимо от того,
 * как часто мутируется `telemetry`.
 */
const UI_SAMPLE_HZ = 30;
const UI_SAMPLE_PERIOD_MS = 1000 / UI_SAMPLE_HZ;

type TupleKey = 'wheelOmega' | 'wheelOmegaTarget' | 'wheelCurrent' | 'wheelTemperature';

const listeners = new Set<() => void>();
let rafId = 0;
let nextSampleAt = 0;
let currentFrame: RobotTelemetry | null = null;

function tuple4(
  source: readonly [number, number, number, number],
): [number, number, number, number] {
  return [source[0], source[1], source[2], source[3]];
}

export function readTelemetryFrame(): RobotTelemetry {
  return {
    positionX: telemetry.positionX,
    positionY: telemetry.positionY,
    positionZ: telemetry.positionZ,
    roll: telemetry.roll,
    pitch: telemetry.pitch,
    yaw: telemetry.yaw,
    speed: telemetry.speed,
    yawRate: telemetry.yawRate,
    wheelOmega: tuple4(telemetry.wheelOmega),
    wheelOmegaTarget: tuple4(telemetry.wheelOmegaTarget),
    wheelCurrent: tuple4(telemetry.wheelCurrent),
    wheelTemperature: tuple4(telemetry.wheelTemperature),
    spinnerRpm: telemetry.spinnerRpm,
    spinnerTargetRpm: telemetry.spinnerTargetRpm,
    spinnerCurrent: telemetry.spinnerCurrent,
    spinnerTemperature: telemetry.spinnerTemperature,
    batterySoc: telemetry.batterySoc,
    batteryVoltageOpen: telemetry.batteryVoltageOpen,
    batteryVoltageLoad: telemetry.batteryVoltageLoad,
    batteryCurrent: telemetry.batteryCurrent,
    batteryTemperature: telemetry.batteryTemperature,
    filteredRoll: telemetry.filteredRoll,
    filteredPitch: telemetry.filteredPitch,
    filteredYaw: telemetry.filteredYaw,
    rangeMeters: telemetry.rangeMeters,
    fsmState: telemetry.fsmState,
    fsmLastTransition: telemetry.fsmLastTransition,
    arenaDamage: telemetry.arenaDamage,
    robotHealth: telemetry.robotHealth,
    robotDamage: telemetry.robotDamage,
    robotDamageLastSource: telemetry.robotDamageLastSource,
    robotDamageLastAtMs: telemetry.robotDamageLastAtMs,
    robotDamageLastEnergyJ: telemetry.robotDamageLastEnergyJ,
    robotDamageLastForceN: telemetry.robotDamageLastForceN,
  };
}

function startSampler(): void {
  nextSampleAt = performance.now();
  const tick = (now: number) => {
    if (listeners.size === 0) {
      rafId = 0;
      return;
    }
    if (now >= nextSampleAt) {
      currentFrame = null;
      for (const listener of listeners) listener();
      nextSampleAt = Math.max(nextSampleAt + UI_SAMPLE_PERIOD_MS, now - UI_SAMPLE_PERIOD_MS);
    }
    rafId = window.requestAnimationFrame(tick);
  };
  rafId = window.requestAnimationFrame(tick);
}

function subscribeToTelemetry(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) startSampler();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && rafId !== 0) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

function getFrameSnapshot(): RobotTelemetry {
  if (currentFrame === null) currentFrame = readTelemetryFrame();
  return currentFrame;
}

/**
 * Полный снимок телеметрии. Идентичность объекта меняется ≤30 раз/с — re-render
 * подписчиков ограничен. Используйте только когда действительно нужен почти весь
 * набор полей; для отдельных значений предпочитайте `useTelemetryField` /
 * `useTelemetryTupleAt`, которые сравнивают примитивы через `Object.is`
 * и пропускают re-render если значение не изменилось.
 */
export function useTelemetryFrame(_sampleHz = UI_SAMPLE_HZ): RobotTelemetry {
  void _sampleHz;
  return useSyncExternalStore(subscribeToTelemetry, getFrameSnapshot, getFrameSnapshot);
}

/**
 * Подписка на одно скалярное поле телеметрии. Re-render только когда `Object.is`
 * считает старое и новое значение разными — идеально для HUD-индикаторов,
 * меняющихся реже, чем UI-сэмплер просыпается.
 */
export function useTelemetryField<K extends keyof RobotTelemetry>(key: K): RobotTelemetry[K] {
  const get = () => telemetry[key];
  return useSyncExternalStore(subscribeToTelemetry, get, get);
}

/**
 * Подписка на элемент tuple-поля (ω колёс, токи, температуры). Возвращает
 * примитив `number`, поэтому `Object.is` гасит лишние re-render.
 */
export function useTelemetryTupleAt<K extends TupleKey>(key: K, idx: 0 | 1 | 2 | 3): number {
  const get = () => telemetry[key][idx] ?? 0;
  return useSyncExternalStore(subscribeToTelemetry, get, get);
}

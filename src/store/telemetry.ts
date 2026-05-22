import { proxy } from 'valtio';
import { ROBOT_MAX_HEALTH, type RobotDamageSource } from '@/physics/robotDamage.ts';

/**
 * Высокочастотная телеметрия (60+ Гц) — отдельно от zustand, через valtio,
 * чтобы каждое изменение НЕ дёргало перерендеры всего дерева React.
 *
 * React HUD читает стабильный UI-кадр через `useTelemetryFrame`, а не напрямую
 * подписывается на каждую физическую мутацию.
 */

export interface RobotTelemetry {
  /** Поза */
  positionX: number;
  positionY: number;
  positionZ: number;
  /** Углы Эйлера, рад */
  roll: number;
  pitch: number;
  yaw: number;
  /** Линейная скорость, м/с */
  speed: number;
  /** Угловая скорость рыскания, рад/с */
  yawRate: number;

  /** Колёса: ω, рад/с */
  wheelOmega: [number, number, number, number];
  /** Заданные ω */
  wheelOmegaTarget: [number, number, number, number];
  /** Токи моторов хода, А */
  wheelCurrent: [number, number, number, number];
  /** Температуры моторов хода, °C */
  wheelTemperature: [number, number, number, number];

  /** Спиннер */
  spinnerRpm: number;
  spinnerTargetRpm: number;
  spinnerCurrent: number;
  spinnerTemperature: number;

  /** АКБ */
  batterySoc: number;
  batteryVoltageOpen: number;
  batteryVoltageLoad: number;
  batteryCurrent: number;
  batteryTemperature: number;

  /** Сенсоры (после фильтрации) */
  filteredRoll: number;
  filteredPitch: number;
  filteredYaw: number;
  rangeMeters: number;

  /** FSM */
  fsmState: string;
  fsmLastTransition: string;

  /** Арена */
  arenaDamage: number;
  /** Прочность робота */
  robotHealth: number;
  robotDamage: number;
  robotDamageLastSource: RobotDamageSource;
  robotDamageLastAtMs: number;
  robotDamageLastEnergyJ: number;
  robotDamageLastForceN: number;
}

export const telemetry = proxy<RobotTelemetry>({
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  roll: 0,
  pitch: 0,
  yaw: 0,
  speed: 0,
  yawRate: 0,

  wheelOmega: [0, 0, 0, 0],
  wheelOmegaTarget: [0, 0, 0, 0],
  wheelCurrent: [0, 0, 0, 0],
  wheelTemperature: [22, 22, 22, 22],

  spinnerRpm: 0,
  spinnerTargetRpm: 0,
  spinnerCurrent: 0,
  spinnerTemperature: 22,

  batterySoc: 1,
  batteryVoltageOpen: 50.4,
  batteryVoltageLoad: 50.4,
  batteryCurrent: 0,
  batteryTemperature: 22,

  filteredRoll: 0,
  filteredPitch: 0,
  filteredYaw: 0,
  rangeMeters: Number.POSITIVE_INFINITY,

  fsmState: 'IDLE',
  fsmLastTransition: '',

  arenaDamage: 0,
  robotHealth: ROBOT_MAX_HEALTH,
  robotDamage: 0,
  robotDamageLastSource: 'none',
  robotDamageLastAtMs: -Infinity,
  robotDamageLastEnergyJ: 0,
  robotDamageLastForceN: 0,
});

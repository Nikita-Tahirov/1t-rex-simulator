/**
 * Привод 4WD: связка из 4 моторов + 4 ПИД-регуляторов скорости + общей АКБ.
 *
 * Каждый шаг:
 *   1. PID на каждом колесе по setpointWheelSpeed[i] vs measuredWheelSpeed[i]
 *   2. Выход PID (∈ [-1,1]) → duty мотора
 *   3. MotorModel.step → wheelTorque, current
 *   4. Σ токов → BatteryModel.step → V_load → Limit duty (анти-просадка)
 *
 * Возвращает массив моментов на колёсах для применения в Rapier vehicle controller.
 */

import { BatteryModel, type BatteryParams } from './battery.ts';
import { MotorModel, type MotorParams, type MotorState } from './motor.ts';
import { PIDController, type PIDParams } from './pid.ts';

export type WheelIndex = 0 | 1 | 2 | 3; // FL, FR, RL, RR

export interface DrivetrainParams {
  motor: MotorParams;
  pid: PIDParams;
  battery: BatteryParams;
  /** Минимальное напряжение АКБ под нагрузкой, ниже которого duty ограничивается, В. */
  brownoutVoltage?: number;
}

export interface DrivetrainStep {
  motors: MotorState[];
  battery: ReturnType<BatteryModel['snapshot']>;
  totalCurrent: number;
}

export class Drivetrain4WD {
  private readonly motors: MotorModel[];
  private readonly pids: PIDController[];
  private readonly battery: BatteryModel;
  private readonly brownoutVoltage: number;

  constructor(params: DrivetrainParams) {
    this.motors = [0, 1, 2, 3].map(() => new MotorModel(params.motor));
    this.pids = [0, 1, 2, 3].map(
      () =>
        new PIDController({
          ...params.pid,
          outputMin: params.pid.outputMin ?? -1,
          outputMax: params.pid.outputMax ?? 1,
        }),
    );
    this.battery = new BatteryModel(params.battery);
    this.brownoutVoltage = params.brownoutVoltage ?? 36; // ~3.0 В/банка для 12S
  }

  setGains(kp: number, ki: number, kd: number): void {
    for (const pid of this.pids) pid.setGains(kp, ki, kd);
  }

  /**
   * Один шаг привода.
   * @param targetWheelSpeed [FL,FR,RL,RR] заданные ω, рад/с
   * @param measuredWheelSpeed [FL,FR,RL,RR] фактические ω, рад/с
   * @param dt шаг времени, с
   */
  step(
    targetWheelSpeed: [number, number, number, number],
    measuredWheelSpeed: [number, number, number, number],
    dt: number,
  ): DrivetrainStep {
    let totalCurrent = 0;
    const motorStates: MotorState[] = [];

    // 1. PID + Motor для каждого колеса (используем V_load из ПРЕДЫДУЩЕГО шага)
    const vLoad = this.battery.snapshot().voltageLoad;
    const brownoutScale =
      vLoad < this.brownoutVoltage ? Math.max(0.1, vLoad / this.brownoutVoltage) : 1;

    for (let i = 0; i < 4; i++) {
      const pid = this.pids[i];
      const motor = this.motors[i];
      if (!pid || !motor) continue;
      const ws = measuredWheelSpeed[i] ?? 0;
      const ts = targetWheelSpeed[i] ?? 0;
      const duty = pid.update(ts, ws, dt) * brownoutScale;
      const state = motor.step(duty, ws, dt);
      motorStates.push(state);
      totalCurrent += Math.abs(state.current);
    }

    // 2. Энергия — обновление АКБ
    const battery = this.battery.step(totalCurrent, dt);

    return { motors: motorStates, battery, totalCurrent };
  }

  /** Текущее состояние АКБ (для панели индикации). */
  batterySnapshot() {
    return this.battery.snapshot();
  }

  /** Сбросить интеграторы ПИД (например, при смене режима). */
  resetPIDs(): void {
    for (const pid of this.pids) pid.reset();
  }
}

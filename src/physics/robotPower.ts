import { BatteryModel, type BatteryState } from '@/control/battery.ts';
import { MotorModel, type MotorState } from '@/control/motor.ts';
import { clamp } from '@/lib/math.ts';
import { type RobotTelemetry, telemetry } from '@/store/telemetry.ts';
import { ROBOT } from './constants.ts';

const BROWNOUT_VOLTAGE = 36;
const AUX_CURRENT_A = 2.2;

const BATTERY_PARAMS = {
  seriesCells: 12,
  capacityAh: 22,
  initialSoc: 1,
  internalResistance: 0.3,
  heatCapacity: 4000,
  thermalConductance: 1.5,
  ambientTemperatureC: 22,
} as const;

const DRIVE_MOTOR_PARAMS = {
  stallTorque: 8,
  noLoadSpeed: 800,
  stallCurrent: 60,
  gearRatio: 12,
  gearEfficiency: 0.9,
  windingResistance: 0.05,
  heatCapacity: 250,
  thermalConductance: 1.2,
  ambientTemperatureC: 22,
  currentLimit: 40,
} as const;

const SPINNER_MOTOR_PARAMS = {
  stallTorque: 5.5,
  noLoadSpeed: (ROBOT.spinnerMaxRpm * 2 * Math.PI) / 60,
  stallCurrent: 140,
  gearRatio: 1,
  gearEfficiency: 0.92,
  windingResistance: 0.035,
  heatCapacity: 320,
  thermalConductance: 1.4,
  ambientTemperatureC: 22,
  currentLimit: 95,
} as const;

export interface RobotPowerStep {
  battery: BatteryState;
  wheelMotors: MotorState[];
  spinnerMotor: MotorState;
  totalCurrent: number;
  brownoutScale: number;
}

export class RobotPowerModel {
  private wheelMotors = createWheelMotors();
  private spinnerMotor = new MotorModel(SPINNER_MOTOR_PARAMS);
  private battery = new BatteryModel(BATTERY_PARAMS);

  reset(): BatteryState {
    this.wheelMotors = createWheelMotors();
    this.spinnerMotor = new MotorModel(SPINNER_MOTOR_PARAMS);
    this.battery = new BatteryModel(BATTERY_PARAMS);
    return this.battery.snapshot();
  }

  brownoutScale(): number {
    const voltage = this.battery.snapshot().voltageLoad;
    return voltage < BROWNOUT_VOLTAGE ? clamp(voltage / BROWNOUT_VOLTAGE, 0.15, 1) : 1;
  }

  step({
    targetWheelOmega,
    measuredWheelOmega,
    spinnerTargetRpm,
    spinnerRpm,
    dt,
  }: {
    targetWheelOmega: [number, number, number, number];
    measuredWheelOmega: [number, number, number, number];
    spinnerTargetRpm: number;
    spinnerRpm: number;
    dt: number;
  }): RobotPowerStep {
    const wheelMotors: MotorState[] = [];
    let totalCurrent = AUX_CURRENT_A;
    const maxWheelOmega = ROBOT.maxLinearSpeed / ROBOT.wheelRadius;

    for (let i = 0; i < 4; i++) {
      const duty = clamp((targetWheelOmega[i] ?? 0) / maxWheelOmega, -1, 1);
      const motor = this.wheelMotors[i];
      if (!motor) continue;
      const state = motor.step(duty, measuredWheelOmega[i] ?? 0, dt);
      wheelMotors.push(state);
      totalCurrent += Math.abs(state.current);
    }

    const spinnerState = this.spinnerMotor.step(
      spinnerDuty(spinnerTargetRpm, spinnerRpm),
      (Math.abs(spinnerRpm) * (2 * Math.PI)) / 60,
      dt,
    );
    totalCurrent += Math.abs(spinnerState.current);

    const battery = this.battery.step(totalCurrent, dt);
    return {
      battery,
      wheelMotors,
      spinnerMotor: spinnerState,
      totalCurrent,
      brownoutScale: this.brownoutScale(),
    };
  }
}

export function publishRobotPowerTelemetry(
  step: RobotPowerStep,
  target: RobotTelemetry = telemetry,
): void {
  target.batterySoc = step.battery.soc;
  target.batteryVoltageOpen = step.battery.voltageOpen;
  target.batteryVoltageLoad = step.battery.voltageLoad;
  target.batteryCurrent = step.battery.current;
  target.batteryTemperature = step.battery.temperatureC;
  for (let i = 0; i < 4; i++) {
    target.wheelCurrent[i] = step.wheelMotors[i]?.current ?? 0;
    target.wheelTemperature[i] = step.wheelMotors[i]?.temperatureC ?? 22;
  }
  target.spinnerCurrent = step.spinnerMotor.current;
  target.spinnerTemperature = step.spinnerMotor.temperatureC;
}

export function resetRobotPowerTelemetry(target: RobotTelemetry = telemetry): void {
  const battery = new BatteryModel(BATTERY_PARAMS).snapshot();
  publishRobotPowerTelemetry(
    {
      battery,
      wheelMotors: [0, 1, 2, 3].map(() => ({
        motorSpeed: 0,
        wheelSpeed: 0,
        wheelTorque: 0,
        current: 0,
        temperatureC: 22,
        duty: 0,
      })),
      spinnerMotor: {
        motorSpeed: 0,
        wheelSpeed: 0,
        wheelTorque: 0,
        current: 0,
        temperatureC: 22,
        duty: 0,
      },
      totalCurrent: 0,
      brownoutScale: 1,
    },
    target,
  );
}

function createWheelMotors(): MotorModel[] {
  return [0, 1, 2, 3].map(() => new MotorModel(DRIVE_MOTOR_PARAMS));
}

function spinnerDuty(targetRpm: number, measuredRpm: number): number {
  const target = clamp(targetRpm / ROBOT.spinnerMaxRpm, 0, 1);
  if (target <= 0) return 0;
  const spinupError = clamp((targetRpm - Math.abs(measuredRpm)) / ROBOT.spinnerMaxRpm, 0, 1);
  return clamp(target + spinupError * 0.35, 0, 1);
}

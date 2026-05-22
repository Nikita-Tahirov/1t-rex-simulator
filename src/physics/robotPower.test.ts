import { describe, expect, it } from 'vitest';
import { RobotPowerModel } from './robotPower.ts';

const ZERO_WHEELS: [number, number, number, number] = [0, 0, 0, 0];
const DRIVE_WHEELS: [number, number, number, number] = [45, 45, 45, 45];

describe('robot runtime power model', () => {
  it('keeps idle load low but non-zero for onboard electronics', () => {
    const power = new RobotPowerModel();
    const step = power.step({
      targetWheelOmega: ZERO_WHEELS,
      measuredWheelOmega: ZERO_WHEELS,
      spinnerTargetRpm: 0,
      spinnerRpm: 0,
      dt: 0.1,
    });

    expect(step.totalCurrent).toBeGreaterThan(0);
    expect(step.totalCurrent).toBeLessThan(5);
    expect(step.battery.voltageLoad).toBeLessThan(step.battery.voltageOpen);
  });

  it('draws higher current when the drive and spinner are loaded', () => {
    const power = new RobotPowerModel();
    const idle = power.step({
      targetWheelOmega: ZERO_WHEELS,
      measuredWheelOmega: ZERO_WHEELS,
      spinnerTargetRpm: 0,
      spinnerRpm: 0,
      dt: 0.1,
    });
    const loaded = power.step({
      targetWheelOmega: DRIVE_WHEELS,
      measuredWheelOmega: ZERO_WHEELS,
      spinnerTargetRpm: 5000,
      spinnerRpm: 0,
      dt: 0.1,
    });

    expect(loaded.totalCurrent).toBeGreaterThan(idle.totalCurrent + 20);
    expect(loaded.battery.voltageLoad).toBeLessThan(idle.battery.voltageLoad);
  });

  it('decreases SOC over sustained use', () => {
    const power = new RobotPowerModel();
    const start = power.step({
      targetWheelOmega: ZERO_WHEELS,
      measuredWheelOmega: ZERO_WHEELS,
      spinnerTargetRpm: 0,
      spinnerRpm: 0,
      dt: 0,
    }).battery.soc;

    let end = start;
    for (let i = 0; i < 600; i++) {
      end = power.step({
        targetWheelOmega: DRIVE_WHEELS,
        measuredWheelOmega: [20, 20, 20, 20],
        spinnerTargetRpm: 5000,
        spinnerRpm: 2500,
        dt: 0.1,
      }).battery.soc;
    }

    expect(end).toBeLessThan(start);
  });
});

import { describe, expect, it } from 'vitest';
import { Drivetrain4WD } from './drivetrain.ts';

const makeDrive = () =>
  new Drivetrain4WD({
    motor: {
      stallTorque: 2.0,
      noLoadSpeed: 200,
      stallCurrent: 30,
      gearRatio: 10,
      gearEfficiency: 0.9,
      windingResistance: 0.1,
      currentLimit: 25,
    },
    pid: { kp: 0.05, ki: 0.1, kd: 0, outputMin: -1, outputMax: 1 },
    battery: { seriesCells: 12, capacityAh: 10, initialSoc: 1 },
    brownoutVoltage: 36,
  });

describe('Drivetrain4WD', () => {
  it('даёт момент на всех 4 колёсах при ненулевом задании', () => {
    const d = makeDrive();
    const out = d.step([10, 10, 10, 10], [0, 0, 0, 0], 0.01);
    expect(out.motors).toHaveLength(4);
    for (const m of out.motors) {
      expect(m.wheelTorque).toBeGreaterThan(0);
    }
  });

  it('totalCurrent > 0 при нагрузке', () => {
    const d = makeDrive();
    const out = d.step([10, 10, 10, 10], [0, 0, 0, 0], 0.01);
    expect(out.totalCurrent).toBeGreaterThan(0);
  });

  it('просаживает АКБ под нагрузкой', () => {
    const d = makeDrive();
    for (let i = 0; i < 100; i++) d.step([10, 10, 10, 10], [0, 0, 0, 0], 0.01);
    const snap = d.batterySnapshot();
    expect(snap.voltageLoad).toBeLessThan(snap.voltageOpen);
  });

  it('левая/правая пары независимы', () => {
    const d = makeDrive();
    const out = d.step([10, -10, 10, -10], [0, 0, 0, 0], 0.01);
    expect(out.motors[0]?.wheelTorque).toBeGreaterThan(0);
    expect(out.motors[1]?.wheelTorque).toBeLessThan(0);
  });

  it('resetPIDs обнуляет интеграторы', () => {
    const d = makeDrive();
    for (let i = 0; i < 50; i++) d.step([5, 5, 5, 5], [0, 0, 0, 0], 0.01);
    d.resetPIDs();
    // После reset один шаг с нулевым setpoint и нулевой скоростью даёт нулевой duty
    const out = d.step([0, 0, 0, 0], [0, 0, 0, 0], 0.01);
    for (const m of out.motors) {
      expect(Math.abs(m.duty)).toBeLessThan(1e-3);
    }
  });
});

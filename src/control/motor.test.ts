import { describe, expect, it } from 'vitest';
import { MotorModel } from './motor.ts';

describe('MotorModel', () => {
  const baseParams = {
    stallTorque: 2.0,
    noLoadSpeed: 200,
    stallCurrent: 30,
    gearRatio: 10,
    gearEfficiency: 0.9,
    windingResistance: 0.1,
    currentLimit: 25,
  };

  it('даёт максимальный момент при duty=1 и нулевой скорости', () => {
    const m = new MotorModel(baseParams);
    const s = m.step(1, 0, 0.01);
    // Ток ограничен currentLimit=25 (а не stallCurrent=30) → момент = 25 * 2/30 = 1.667
    // На выходе: 1.667 * 10 * 0.9 = 15
    expect(s.wheelTorque).toBeCloseTo(15, 1);
  });

  it('момент падает при росте скорости', () => {
    const m = new MotorModel(baseParams);
    // Скорость на выходе редуктора → перенос на мотор: ω_motor = ω_wheel × gearRatio
    // На половине ω_noload получим половину stall-момента
    const halfNoLoadOnWheel = (baseParams.noLoadSpeed * 0.5) / baseParams.gearRatio;
    const sLow = m.step(1, 0, 0.01);
    const sHigh = m.step(1, halfNoLoadOnWheel, 0.01);
    expect(sHigh.wheelTorque).toBeLessThan(sLow.wheelTorque);
  });

  it('защита по току ограничивает максимум', () => {
    const m = new MotorModel({ ...baseParams, currentLimit: 5 });
    const s = m.step(1, 0, 0.01);
    expect(s.current).toBeLessThanOrEqual(5.0001);
  });

  it('греется при удержании момента', () => {
    const m = new MotorModel(baseParams);
    for (let i = 0; i < 10000; i++) m.step(1, 0, 0.01);
    expect(m.snapshot().temperatureC).toBeGreaterThan(40);
  });

  it('меняет знак момента при duty < 0', () => {
    const m = new MotorModel(baseParams);
    const s = m.step(-1, 0, 0.01);
    expect(s.wheelTorque).toBeLessThan(0);
  });

  it('electricPower растёт пропорционально току', () => {
    const m = new MotorModel(baseParams);
    m.step(1, 0, 0.01);
    expect(m.electricPower(48)).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { BatteryModel } from './battery.ts';

describe('BatteryModel 12S Li-Po', () => {
  it('полностью заряженная сборка даёт ~50.4 В без нагрузки', () => {
    const b = new BatteryModel({ seriesCells: 12, capacityAh: 10, initialSoc: 1 });
    const s = b.step(0, 0.01);
    expect(s.voltageOpen).toBeCloseTo(50.4, 1);
    expect(s.voltageLoad).toBeCloseTo(50.4, 1);
  });

  it('напряжение под нагрузкой просаживается на I·r', () => {
    const b = new BatteryModel({
      seriesCells: 12,
      capacityAh: 10,
      initialSoc: 1,
      internalResistance: 0.3,
    });
    const s = b.step(50, 0.01); // 50 А разряд
    expect(s.voltageOpen - s.voltageLoad).toBeCloseTo(15, 1); // 50 × 0.3
  });

  it('SOC уменьшается при разряде', () => {
    const b = new BatteryModel({ seriesCells: 12, capacityAh: 10, initialSoc: 1 });
    // 10 А · 360 с = 1 А·ч → 10% от 10 А·ч ёмкости
    for (let i = 0; i < 360 * 100; i++) b.step(10, 0.01);
    expect(b.snapshot().soc).toBeCloseTo(0.9, 1);
  });

  it('нагревается при разряде; остывает к ambient в простое', () => {
    const b = new BatteryModel({
      seriesCells: 12,
      capacityAh: 10,
      initialSoc: 1,
      ambientTemperatureC: 20,
      heatCapacity: 1000,
      thermalConductance: 1,
    });
    for (let i = 0; i < 100; i++) b.step(50, 0.1);
    const hotT = b.snapshot().temperatureC;
    expect(hotT).toBeGreaterThan(20);
    for (let i = 0; i < 5000; i++) b.step(0, 0.1);
    expect(b.snapshot().temperatureC).toBeLessThan(hotT);
  });

  it('isDepleted срабатывает на нижнем пороге SOC', () => {
    const b = new BatteryModel({ seriesCells: 12, capacityAh: 1, initialSoc: 0.04 });
    expect(b.isDepleted()).toBe(true);
  });
});

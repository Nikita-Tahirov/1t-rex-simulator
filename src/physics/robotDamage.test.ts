import { describe, expect, it } from 'vitest';
import {
  applyRobotDamageState,
  computeImpactDamageDelta,
  createRobotDamageState,
  isDamagingArenaRole,
  ROBOT_MAX_HEALTH,
  robotIntegrityBand,
} from './robotDamage.ts';

describe('robot damage model', () => {
  it('starts with full structural health', () => {
    expect(createRobotDamageState().health).toBe(ROBOT_MAX_HEALTH);
    expect(robotIntegrityBand(ROBOT_MAX_HEALTH)).toBe('nominal');
  });

  it('converts high-speed impact energy into bounded damage', () => {
    const slow = computeImpactDamageDelta({ speedMps: 0.5 });
    const fast = computeImpactDamageDelta({ speedMps: 5 });
    expect(slow.damage).toBe(0);
    expect(fast.kineticEnergyJ).toBeGreaterThan(1000);
    expect(fast.damage).toBeGreaterThan(40);
    expect(fast.damage).toBeLessThanOrEqual(140);
  });

  it('tracks last physical cause when damage is applied', () => {
    const damaged = applyRobotDamageState(createRobotDamageState(), {
      amount: 120,
      source: 'impact',
      nowMs: 10,
      energyJ: 1800,
      forceN: 4200,
    });
    expect(damaged.health).toBe(ROBOT_MAX_HEALTH - 120);
    expect(damaged.damage).toBe(120);
    expect(damaged.lastSource).toBe('impact');
    expect(damaged.lastEnergyJ).toBe(1800);
  });

  it('accepts only physical arena hazards as impact damage sources', () => {
    expect(isDamagingArenaRole('arena-wall')).toBe(true);
    expect(isDamagingArenaRole('shredder-rotor')).toBe(true);
    expect(isDamagingArenaRole('arena-ramp')).toBe(false);
    expect(isDamagingArenaRole('arena-floor')).toBe(false);
  });
});

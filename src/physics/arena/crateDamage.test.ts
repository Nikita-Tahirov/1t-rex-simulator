import { describe, expect, it } from 'vitest';
import {
  applyCrateHit,
  CRATE_DAMAGE_COOLDOWN_MS,
  CRATE_MAX_HEALTH,
  crateHealthRatio,
  isCrateDamageRole,
} from './crateDamage.ts';

describe('crate damage progression', () => {
  it('damages crates only from robot body parts', () => {
    expect(isCrateDamageRole('chassis')).toBe(true);
    expect(isCrateDamageRole('spinner')).toBe(true);
    expect(isCrateDamageRole('wheel')).toBe(true);
    expect(isCrateDamageRole('damage-crate')).toBe(false);
    expect(isCrateDamageRole(undefined)).toBe(false);
  });

  it('debounces multiple collision events from a single hit', () => {
    const first = applyCrateHit(
      { health: CRATE_MAX_HEALTH, lastDamageAtMs: -Infinity },
      'chassis',
      1,
    );
    const duplicate = applyCrateHit(first, 'wheel', 1 + CRATE_DAMAGE_COOLDOWN_MS - 1);

    expect(first.health).toBe(CRATE_MAX_HEALTH - 1);
    expect(duplicate).toEqual(first);
  });

  it('allows repeated hits after cooldown', () => {
    const first = applyCrateHit(
      { health: 2, lastDamageAtMs: 0 },
      'spinner',
      CRATE_DAMAGE_COOLDOWN_MS,
    );
    const second = applyCrateHit(first, 'spinner', CRATE_DAMAGE_COOLDOWN_MS * 2);

    expect(first.health).toBe(1);
    expect(second.health).toBe(0);
  });

  it('maps health to stable visual ratios', () => {
    expect(crateHealthRatio(CRATE_MAX_HEALTH)).toBe(1);
    expect(crateHealthRatio(0)).toBe(0);
  });
});

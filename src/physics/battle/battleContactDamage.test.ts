import { describe, expect, it } from 'vitest';
import {
  CONTACT_DAMAGE_COOLDOWN_MS,
  passesContactCooldown,
  RAM_DAMAGE_CAP,
  RAM_FORCE_THRESHOLD_N,
  ROTOR_ACTIVE_RPM,
  ROTOR_FORCE_THRESHOLD_N,
  ramDamageFromForce,
  rotorContactDamage,
  wallImpactExceeds,
} from './battleContactDamage.ts';

describe('ramDamageFromForce', () => {
  it('мягкое касание ниже порога не наносит урона', () => {
    expect(ramDamageFromForce(RAM_FORCE_THRESHOLD_N)).toBe(0);
    expect(ramDamageFromForce(0)).toBe(0);
  });

  it('сильный контакт наносит урон, ограниченный сверху', () => {
    expect(ramDamageFromForce(RAM_FORCE_THRESHOLD_N + 3200)).toBeGreaterThan(0);
    expect(ramDamageFromForce(1e9)).toBe(RAM_DAMAGE_CAP);
  });
});

describe('rotorContactDamage', () => {
  it('не бьёт ниже активных оборотов или при слабой силе', () => {
    expect(rotorContactDamage(ROTOR_ACTIVE_RPM - 1, 5000)).toBe(0);
    expect(rotorContactDamage(7000, ROTOR_FORCE_THRESHOLD_N - 1)).toBe(0);
  });

  it('растёт с оборотами при достаточной силе', () => {
    const mid = rotorContactDamage(3500, 1000);
    const full = rotorContactDamage(7000, 1000);
    expect(mid).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(mid);
  });
});

describe('passesContactCooldown', () => {
  it('первый удар проходит, повтор в окне — нет, после окна — снова да', () => {
    const map = new Map<string, number>();
    expect(passesContactCooldown(map, 'v', 1000)).toBe(true);
    expect(passesContactCooldown(map, 'v', 1000 + CONTACT_DAMAGE_COOLDOWN_MS - 1)).toBe(false);
    expect(passesContactCooldown(map, 'v', 1000 + CONTACT_DAMAGE_COOLDOWN_MS)).toBe(true);
  });
});

describe('wallImpactExceeds', () => {
  it('порог силы удара о стену', () => {
    expect(wallImpactExceeds(100)).toBe(false);
    expect(wallImpactExceeds(5000)).toBe(true);
  });
});

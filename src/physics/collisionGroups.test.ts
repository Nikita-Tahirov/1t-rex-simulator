import { describe, expect, it } from 'vitest';
import {
  CHASSIS_COLLISION_GROUPS,
  CollisionGroup,
  RAMP_COLLISION_GROUPS,
  SPINNER_COLLISION_GROUPS,
  WHEELS_COLLISION_GROUPS,
} from './collisionGroups.ts';

// Rapier collisionGroups bitmask: верхние 16 бит — membership, нижние 16 — filter.
function memberships(mask: number): number {
  return (mask >>> 16) & 0xffff;
}
function filters(mask: number): number {
  return mask & 0xffff;
}
function bit(group: number): number {
  return 1 << group;
}

/**
 * Контакт регистрируется тогда и только тогда, когда:
 *   (A.mem ∩ B.fil) ≠ 0 ∧ (B.mem ∩ A.fil) ≠ 0.
 */
function interacts(a: number, b: number): boolean {
  return (memberships(a) & filters(b)) !== 0 && (memberships(b) & filters(a)) !== 0;
}

const ARENA_DEFAULT_GROUPS = (bit(CollisionGroup.Arena) << 16) | 0xffff;

describe('robot ↔ wedge-ramp collision filter', () => {
  it('исключает wedge-рампы из контакта с шасси (устранение «невидимой стенки»)', () => {
    expect(interacts(CHASSIS_COLLISION_GROUPS, RAMP_COLLISION_GROUPS)).toBe(false);
  });

  it('исключает wedge-рампы из контакта с колёсами (pose-driven Y, ghost-contact паразитен)', () => {
    expect(interacts(WHEELS_COLLISION_GROUPS, RAMP_COLLISION_GROUPS)).toBe(false);
  });

  it('исключает wedge-рампы из контакта с диском ротора', () => {
    expect(interacts(SPINNER_COLLISION_GROUPS, RAMP_COLLISION_GROUPS)).toBe(false);
  });

  it('сохраняет контакт wedge-рампы с динамическими объектами арены (ящики)', () => {
    expect(interacts(RAMP_COLLISION_GROUPS, ARENA_DEFAULT_GROUPS)).toBe(true);
  });

  it('сохраняет контакт шасси с дефолтной группой арены (пол, стены, deck)', () => {
    expect(interacts(CHASSIS_COLLISION_GROUPS, ARENA_DEFAULT_GROUPS)).toBe(true);
  });

  it('сохраняет контакт колёс с дефолтной группой арены', () => {
    expect(interacts(WHEELS_COLLISION_GROUPS, ARENA_DEFAULT_GROUPS)).toBe(true);
  });

  it('не путает робототехнические группы между собой (joint-ы держат части вместе)', () => {
    expect(interacts(CHASSIS_COLLISION_GROUPS, WHEELS_COLLISION_GROUPS)).toBe(false);
    expect(interacts(CHASSIS_COLLISION_GROUPS, SPINNER_COLLISION_GROUPS)).toBe(false);
    expect(interacts(WHEELS_COLLISION_GROUPS, SPINNER_COLLISION_GROUPS)).toBe(false);
  });
});

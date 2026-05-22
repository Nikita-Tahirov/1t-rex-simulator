export const CRATE_MAX_HEALTH = 4;
export const CRATE_DAMAGE_COOLDOWN_MS = 420;

const CRATE_DAMAGE_ROLES = new Set(['chassis', 'spinner', 'wheel']);

export interface CrateDamageState {
  health: number;
  lastDamageAtMs: number;
}

export function isCrateDamageRole(role: unknown): boolean {
  return typeof role === 'string' && CRATE_DAMAGE_ROLES.has(role);
}

export function applyCrateHit(
  state: CrateDamageState,
  role: unknown,
  nowMs: number,
): CrateDamageState {
  if (!isCrateDamageRole(role)) return state;
  if (nowMs - state.lastDamageAtMs < CRATE_DAMAGE_COOLDOWN_MS) return state;
  return {
    health: Math.max(0, state.health - 1),
    lastDamageAtMs: nowMs,
  };
}

export function crateHealthRatio(health: number): number {
  return Math.max(0, Math.min(1, health / CRATE_MAX_HEALTH));
}

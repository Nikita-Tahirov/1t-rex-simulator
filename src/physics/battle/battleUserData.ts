/**
 * Чтение `userData` тела из контактного события Rapier на границе (внешний объект →
 * типизированная форма). Боевые тела помечаются `{ role:'battle-robot', uid }`,
 * стены арены — `{ role:'arena-wall' }` и т.п.
 */

export interface BattleBodyUserData {
  role?: string;
  uid?: string;
}

export function readBattleUserData(userData: unknown): BattleBodyUserData {
  if (typeof userData !== 'object' || userData === null) return {};
  const record = userData as Record<string, unknown>;
  const out: BattleBodyUserData = {};
  if (typeof record.role === 'string') out.role = record.role;
  if (typeof record.uid === 'string') out.uid = record.uid;
  return out;
}

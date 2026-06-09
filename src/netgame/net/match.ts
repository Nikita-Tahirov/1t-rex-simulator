import { MAX_PLAYERS, type PlayerInfo, type PlayerState } from './types.ts';

/**
 * Чистая логика матча: назначение углов, подсчёт живых и определение
 * победителя. Без побочных эффектов — поэтому покрывается unit-тестами и
 * одинаково работает в любом адаптере (in-memory / Firebase).
 */

/** Первый свободный индекс угла 0..3 среди существующих игроков (для входа). */
export function nextColorIndex(players: Record<string, PlayerInfo>): number {
  const taken = new Set(Object.values(players).map((p) => p.colorIndex));
  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    if (!taken.has(i)) return i;
  }
  return MAX_PLAYERS - 1;
}

/** Игроки, упорядоченные по времени входа (стабильный порядок углов). */
export function playersByJoinOrder(players: Record<string, PlayerInfo>): PlayerInfo[] {
  return Object.values(players).sort(
    (a, b) => a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid),
  );
}

/**
 * Нормализованное распределение углов на старте боя: компактные 0..N-1 в порядке
 * рангов цвета из лобби (`colorIndex`). Убирает «дыры», если кто-то вышел, и при
 * этом сохраняет соответствие «цвет в лобби ↔ угол в бою». → uid → corner.
 */
export function assignStartCorners(players: Record<string, PlayerInfo>): Record<string, number> {
  const ordered = Object.values(players).sort(
    (a, b) => a.colorIndex - b.colorIndex || a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid),
  );
  const result: Record<string, number> = {};
  ordered.forEach((player, index) => {
    result[player.uid] = index;
  });
  return result;
}

/** Жив ли участник: нет снимка → ещё не отчитался, считаем живым. */
export function isParticipantAlive(uid: string, states: Record<string, PlayerState>): boolean {
  const state = states[uid];
  if (!state) return true;
  return state.alive && state.health > 0;
}

/** Число живых участников среди тех, кто в комнате. */
export function countAliveParticipants(
  players: Record<string, PlayerInfo>,
  states: Record<string, PlayerState>,
): number {
  return Object.keys(players).filter((uid) => isParticipantAlive(uid, states)).length;
}

export interface WinnerResult {
  /** Решён ли исход боя. */
  decided: boolean;
  /** Uid победителя, либо null при ничьей (взаимное уничтожение). */
  winnerId: string | null;
}

/**
 * Определяет исход боя по текущему состоянию: бой завершён, когда живых ≤1.
 * Один живой → победитель; ноль живых → ничья; единственный оставшийся в
 * комнате (остальные вышли) → победитель.
 */
export function computeWinner(
  players: Record<string, PlayerInfo>,
  states: Record<string, PlayerState>,
): WinnerResult {
  const participants = Object.keys(players);
  if (participants.length <= 1) {
    return { decided: true, winnerId: participants[0] ?? null };
  }
  const alive = participants.filter((uid) => isParticipantAlive(uid, states));
  if (alive.length === 1) return { decided: true, winnerId: alive[0]! };
  if (alive.length === 0) return { decided: true, winnerId: null };
  return { decided: false, winnerId: null };
}

/**
 * Победитель по здоровью — резервное правило для страховочного таймера матча:
 * самый «целый» среди живых. Ничья (null) при равенстве максимума или 0 живых.
 */
export function winnerByHealth(
  players: Record<string, PlayerInfo>,
  states: Record<string, PlayerState>,
): string | null {
  let bestUid: string | null = null;
  let bestHealth = -1;
  let tie = false;
  for (const uid of Object.keys(players)) {
    if (!isParticipantAlive(uid, states)) continue;
    const health = states[uid]?.health ?? Number.POSITIVE_INFINITY;
    if (health > bestHealth) {
      bestHealth = health;
      bestUid = uid;
      tie = false;
    } else if (health === bestHealth) {
      tie = true;
    }
  }
  return tie ? null : bestUid;
}

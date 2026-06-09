import type { PlayerInfo, RoomSnapshot } from './types.ts';

/**
 * Чистые правила лобби: кто host, все ли готовы, можно ли стартовать.
 * Без побочных эффектов — покрываются unit-тестами и переиспользуются в UI.
 */

const MIN_PLAYERS_TO_START = 2;

export function isHost(room: RoomSnapshot, uid: string): boolean {
  return room.meta.hostId === uid;
}

export function playerList(players: Record<string, PlayerInfo>): PlayerInfo[] {
  return Object.values(players).sort(
    (a, b) => a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid),
  );
}

export function readyCount(players: Record<string, PlayerInfo>): number {
  return Object.values(players).filter((p) => p.ready).length;
}

/** Все игроки готовы (и есть хотя бы один). */
export function allReady(players: Record<string, PlayerInfo>): boolean {
  const list = Object.values(players);
  return list.length > 0 && list.every((p) => p.ready);
}

/** Host может стартовать: ≥2 игроков, все готовы, статус — лобби. */
export function canStartMatch(room: RoomSnapshot, uid: string): boolean {
  return (
    isHost(room, uid) &&
    room.meta.status === 'lobby' &&
    Object.keys(room.players).length >= MIN_PLAYERS_TO_START &&
    allReady(room.players)
  );
}

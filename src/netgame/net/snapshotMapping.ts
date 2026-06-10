import {
  MAX_PLAYERS,
  type PlayerInfo,
  type PlayerState,
  type RoomListItem,
  type RoomMeta,
  type RoomSnapshot,
  type RoomStatus,
} from './types.ts';

/**
 * Нормализация внешнего JSON из RTDB: всё, что приходит из сети, считаем
 * `unknown` и приводим к типам на границе (инвариант проекта). Любые отсутствующие
 * или «битые» поля заменяются дефолтами — UI всегда получает валидную форму.
 */

const MAX_NAME_LEN = 24;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function asStatus(value: unknown): RoomStatus {
  return value === 'countdown' || value === 'active' || value === 'finished' ? value : 'lobby';
}

function normalizeCorners(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [uid, value] of Object.entries(asRecord(raw))) out[uid] = asNumber(value, 0);
  return out;
}

export function normalizeMeta(roomId: string, raw: unknown): RoomMeta {
  const meta = asRecord(raw);
  return {
    roomId,
    name: asString(meta.name, 'Комната').slice(0, MAX_NAME_LEN),
    hostId: asString(meta.hostId, ''),
    status: asStatus(meta.status),
    arenaSeed: asNumber(meta.arenaSeed, 0),
    maxPlayers: asNumber(meta.maxPlayers, MAX_PLAYERS),
    createdAt: asNumber(meta.createdAt, 0),
    countdownEndsAt: typeof meta.countdownEndsAt === 'number' ? meta.countdownEndsAt : null,
    winnerId: typeof meta.winnerId === 'string' ? meta.winnerId : null,
    corners: normalizeCorners(meta.corners),
  };
}

export function normalizePlayer(uid: string, raw: unknown): PlayerInfo {
  const player = asRecord(raw);
  return {
    uid,
    name: asString(player.name, 'Пилот').slice(0, MAX_NAME_LEN),
    colorIndex: asNumber(player.colorIndex, 0),
    ready: asBool(player.ready, false),
    joinedAt: asNumber(player.joinedAt, 0),
    presence: asBool(player.presence, true),
  };
}

function normalizeDealt(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [uid, value] of Object.entries(asRecord(raw))) {
    const amount = asNumber(value, 0);
    if (amount > 0) out[uid] = amount;
  }
  return out;
}

export function normalizeState(raw: unknown): PlayerState {
  const state = asRecord(raw);
  return {
    x: asNumber(state.x, 0),
    z: asNumber(state.z, 0),
    y: asNumber(state.y, 0),
    yaw: asNumber(state.yaw, 0),
    qx: asNumber(state.qx, 0),
    qy: asNumber(state.qy, 0),
    qz: asNumber(state.qz, 0),
    qw: asNumber(state.qw, 1),
    speed: asNumber(state.speed, 0),
    vx: asNumber(state.vx, 0),
    vz: asNumber(state.vz, 0),
    spinnerRpm: asNumber(state.spinnerRpm, 0),
    health: asNumber(state.health, 0),
    alive: asBool(state.alive, false),
    seq: asNumber(state.seq, 0),
    t: asNumber(state.t, 0),
    dealt: normalizeDealt(state.dealt),
  };
}

export function normalizeRoom(roomId: string, raw: unknown): RoomSnapshot | null {
  const room = asRecord(raw);
  if (!room.meta) return null;
  const players: Record<string, PlayerInfo> = {};
  for (const [uid, value] of Object.entries(asRecord(room.players))) {
    players[uid] = normalizePlayer(uid, value);
  }
  const states: Record<string, PlayerState> = {};
  for (const [uid, value] of Object.entries(asRecord(room.states))) {
    states[uid] = normalizeState(value);
  }
  return { meta: normalizeMeta(roomId, room.meta), players, states };
}

export function normalizeRoomList(raw: unknown): RoomListItem[] {
  const items: RoomListItem[] = [];
  for (const [roomId, value] of Object.entries(asRecord(raw))) {
    const room = asRecord(value);
    items.push({
      roomId,
      name: asString(room.name, 'Комната').slice(0, MAX_NAME_LEN),
      status: asStatus(room.status),
      playerCount: asNumber(room.playerCount, 0),
      maxPlayers: asNumber(room.maxPlayers, MAX_PLAYERS),
      hostId: asString(room.hostId, ''),
      updatedAt: asNumber(room.updatedAt, 0),
    });
  }
  return items.sort((a, b) => b.roomId.localeCompare(a.roomId));
}

import { randomId } from './clientId.ts';
import { inMemoryBackend } from './inMemoryBackend.ts';
import { assignStartCorners, nextColorIndex, playersByJoinOrder } from './match.ts';
import type { NetworkPort } from './NetworkPort.ts';
import { MAX_PLAYERS, type PlayerInfo, type RoomMeta } from './types.ts';

/**
 * In-memory реализация `NetworkPort` поверх `inMemoryBackend`.
 *
 * Без сети: подходит для unit/e2e и локального демо в нескольких вкладках
 * (опция `crossTab` поднимает BroadcastChannel). Авторитетность та же, что у
 * Firebase: клиент пишет свои `players/$uid` и `states/$uid`, host — `meta`.
 */

const COUNTDOWN_MS = 3000;
const MAX_NAME_LEN = 24;

interface Options {
  /** Поднять BroadcastChannel для синхронизации между вкладками. */
  crossTab?: boolean;
}

function makePlayer(uid: string, name: string, colorIndex: number, joinedAt: number): PlayerInfo {
  return {
    uid,
    name: (name.trim() || 'Пилот').slice(0, MAX_NAME_LEN),
    colorIndex,
    ready: false,
    joinedAt,
    presence: true,
  };
}

export function createInMemoryPort(uid: string, options: Options = {}): NetworkPort {
  if (options.crossTab) inMemoryBackend.attachCrossTab();
  let currentRoomId: string | null = null;

  // Выход из комнаты с передачей host. Намеренно НЕ используем heartbeat-пруннинг:
  // фоновые/перекрытые вкладки троттлят таймеры, из-за чего клиент мог
  // самовыпилиться из своей же комнаты. Presence держим на явном выходе и
  // `pagehide` (закрытие вкладки); краш оставит «призрака» — допустимо для
  // in-memory демо (очищается на перезагрузке).
  const leaveSync = (roomId: string): void => {
    const room = inMemoryBackend.getRoom(roomId);
    if (room && room.meta.hostId === uid) {
      const successor = playersByJoinOrder(room.players).find((p) => p.uid !== uid);
      if (successor) inMemoryBackend.putMeta({ ...room.meta, hostId: successor.uid });
    }
    inMemoryBackend.removePlayer(roomId, uid);
  };

  const onPageHide = (): void => {
    if (currentRoomId) leaveSync(currentRoomId);
  };
  const bindPageHide = (roomId: string): void => {
    currentRoomId = roomId;
    if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);
  };
  const unbindPageHide = (): void => {
    currentRoomId = null;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
  };

  return {
    uid,
    kind: 'memory',
    listRooms: (callback) => inMemoryBackend.subscribeList(callback),
    subscribeRoom: (roomId, callback) => inMemoryBackend.subscribeRoom(roomId, callback),

    async createRoom(roomName, playerName) {
      const roomId = randomId('room');
      const now = Date.now();
      const meta: RoomMeta = {
        roomId,
        name: (roomName.trim() || 'Комната').slice(0, MAX_NAME_LEN),
        hostId: uid,
        status: 'lobby',
        arenaSeed: 0,
        maxPlayers: MAX_PLAYERS,
        createdAt: now,
        countdownEndsAt: null,
        winnerId: null,
        corners: {},
      };
      inMemoryBackend.putMeta(meta);
      inMemoryBackend.putPlayer(roomId, makePlayer(uid, playerName, 0, now));
      bindPageHide(roomId);
      return roomId;
    },

    async joinRoom(roomId, playerName) {
      const room = inMemoryBackend.getRoom(roomId);
      if (!room) throw new Error('Комната не найдена');
      // Лобби-гард: список обновляется асинхронно, и клик «Войти» может
      // прийти после старта боя — пускать в active/finished нельзя.
      if (room.meta.status !== 'lobby') throw new Error('Бой уже идёт или завершён');
      if (Object.keys(room.players).length >= room.meta.maxPlayers) {
        throw new Error('Комната заполнена');
      }
      const colorIndex = nextColorIndex(room.players);
      inMemoryBackend.putPlayer(roomId, makePlayer(uid, playerName, colorIndex, Date.now()));
      bindPageHide(roomId);
    },

    async setReady(roomId, ready) {
      const self = inMemoryBackend.getRoom(roomId)?.players[uid];
      if (!self) return;
      inMemoryBackend.putPlayer(roomId, { ...self, ready });
    },

    async startMatch(roomId) {
      const room = inMemoryBackend.getRoom(roomId);
      if (!room || room.meta.hostId !== uid) return;
      const corners = assignStartCorners(room.players);
      const arenaSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
      inMemoryBackend.putMeta({
        ...room.meta,
        status: 'active',
        arenaSeed,
        corners,
        countdownEndsAt: Date.now() + COUNTDOWN_MS,
      });
    },

    publishState(roomId, state) {
      inMemoryBackend.putState(roomId, uid, state);
    },

    async finishMatch(roomId, winnerId) {
      const room = inMemoryBackend.getRoom(roomId);
      if (!room || room.meta.status !== 'active') return;
      inMemoryBackend.putMeta({
        ...room.meta,
        status: 'finished',
        winnerId,
        countdownEndsAt: null,
      });
    },

    async rematch(roomId) {
      const room = inMemoryBackend.getRoom(roomId);
      if (!room || room.meta.hostId !== uid) return;
      inMemoryBackend.putMeta({
        ...room.meta,
        status: 'lobby',
        winnerId: null,
        arenaSeed: 0,
        corners: {},
        countdownEndsAt: null,
      });
    },

    async leaveRoom(roomId) {
      leaveSync(roomId);
      unbindPageHide();
    },

    async ensureHost(roomId) {
      const room = inMemoryBackend.getRoom(roomId);
      if (!room || room.players[room.meta.hostId]) return;
      const survivors = playersByJoinOrder(room.players);
      if (survivors[0]?.uid === uid) {
        inMemoryBackend.putMeta({ ...room.meta, hostId: uid });
      }
    },

    dispose() {
      unbindPageHide();
    },
  };
}

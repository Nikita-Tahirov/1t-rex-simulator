import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { randomId } from './clientId.ts';
import { getFirebaseHandles } from './firebaseClient.ts';
import { getFirebaseConfig } from './firebaseConfig.ts';
import { assignStartCorners, nextColorIndex, playersByJoinOrder } from './match.ts';
import type { NetworkPort } from './NetworkPort.ts';
import { normalizeRoom, normalizeRoomList } from './snapshotMapping.ts';
import { MAX_PLAYERS, type RoomSnapshot } from './types.ts';

/**
 * Реализация `NetworkPort` поверх Firebase Realtime Database + Anonymous Auth.
 *
 * Модель: каждый клиент пишет только свои `players/$uid` и `states/$uid`; host —
 * `meta`. Presence — через `onDisconnect` (узлы игрока/состояния удаляются при
 * обрыве). Лёгкий `roomsIndex` обслуживает общий список комнат. Внешний JSON
 * нормализуется на границе (`snapshotMapping`).
 *
 * Грузится ленивым чанком (вместе с Firebase SDK) только при выборе firebase —
 * bundle одиночки не тяжелеет.
 */

const COUNTDOWN_MS = 3000;
const MAX_NAME_LEN = 24;

function clampName(name: string, fallback: string): string {
  return (name.trim() || fallback).slice(0, MAX_NAME_LEN);
}

export async function createFirebasePort(): Promise<NetworkPort> {
  const config = getFirebaseConfig();
  if (!config) throw new Error('Firebase config отсутствует');
  const { db, uid } = await getFirebaseHandles(config);

  const metaRef = (roomId: string) => ref(db, `rooms/${roomId}/meta`);
  const playerRef = (roomId: string) => ref(db, `rooms/${roomId}/players/${uid}`);
  const stateRef = (roomId: string) => ref(db, `rooms/${roomId}/states/${uid}`);
  const indexRef = (roomId: string) => ref(db, `roomsIndex/${roomId}`);

  const readRoom = async (roomId: string): Promise<RoomSnapshot | null> => {
    const snapshot = await get(ref(db, `rooms/${roomId}`));
    return snapshot.exists() ? normalizeRoom(roomId, snapshot.val()) : null;
  };

  // Порядок важен: сначала вешаем onDisconnect-удаление, затем пишем онлайн-узел.
  const armPresence = async (roomId: string): Promise<void> => {
    await onDisconnect(playerRef(roomId)).remove();
    await onDisconnect(stateRef(roomId)).remove();
  };

  return {
    uid,

    listRooms(callback) {
      return onValue(ref(db, 'roomsIndex'), (snap) => callback(normalizeRoomList(snap.val())));
    },

    subscribeRoom(roomId, callback) {
      return onValue(ref(db, `rooms/${roomId}`), (snap) =>
        callback(snap.exists() ? normalizeRoom(roomId, snap.val()) : null),
      );
    },

    async createRoom(roomName, playerName) {
      const roomId = randomId('room');
      const name = clampName(roomName, 'Комната');
      await set(metaRef(roomId), {
        roomId,
        name,
        hostId: uid,
        status: 'lobby',
        arenaSeed: 0,
        maxPlayers: MAX_PLAYERS,
        createdAt: serverTimestamp(),
        countdownEndsAt: null,
        winnerId: null,
      });
      await armPresence(roomId);
      await set(playerRef(roomId), {
        name: clampName(playerName, 'Пилот'),
        colorIndex: 0,
        ready: false,
        joinedAt: serverTimestamp(),
        presence: true,
      });
      await set(indexRef(roomId), {
        name,
        status: 'lobby',
        playerCount: 1,
        maxPlayers: MAX_PLAYERS,
        hostId: uid,
        updatedAt: serverTimestamp(),
      });
      return roomId;
    },

    async joinRoom(roomId, playerName) {
      const room = await readRoom(roomId);
      if (!room) throw new Error('Комната не найдена');
      if (Object.keys(room.players).length >= MAX_PLAYERS) throw new Error('Комната заполнена');
      const colorIndex = nextColorIndex(room.players);
      await armPresence(roomId);
      await set(playerRef(roomId), {
        name: clampName(playerName, 'Пилот'),
        colorIndex,
        ready: false,
        joinedAt: serverTimestamp(),
        presence: true,
      });
      await update(indexRef(roomId), {
        playerCount: Object.keys(room.players).length + 1,
        updatedAt: serverTimestamp(),
      });
    },

    async setReady(roomId, ready) {
      await update(playerRef(roomId), { ready });
    },

    async startMatch(roomId) {
      const room = await readRoom(roomId);
      if (!room || room.meta.hostId !== uid) return;
      await update(metaRef(roomId), {
        status: 'active',
        arenaSeed: Math.floor(Math.random() * 0xffffffff) >>> 0,
        corners: assignStartCorners(room.players),
        countdownEndsAt: Date.now() + COUNTDOWN_MS,
      });
      await update(indexRef(roomId), { status: 'active', updatedAt: serverTimestamp() });
    },

    publishState(roomId, state) {
      void set(stateRef(roomId), state);
    },

    async finishMatch(roomId, winnerId) {
      await runTransaction(metaRef(roomId), (current: Record<string, unknown> | null) => {
        if (!current || current.status !== 'active') return current;
        return {
          ...current,
          status: 'finished',
          winnerId: winnerId ?? null,
          countdownEndsAt: null,
        };
      });
      await update(indexRef(roomId), { status: 'finished', updatedAt: serverTimestamp() });
    },

    async rematch(roomId) {
      const room = await readRoom(roomId);
      if (!room || room.meta.hostId !== uid) return;
      await update(metaRef(roomId), {
        status: 'lobby',
        winnerId: null,
        arenaSeed: 0,
        corners: {},
        countdownEndsAt: null,
      });
      await update(indexRef(roomId), { status: 'lobby', updatedAt: serverTimestamp() });
    },

    async leaveRoom(roomId) {
      const room = await readRoom(roomId);
      if (room && room.meta.hostId === uid) {
        const successor = playersByJoinOrder(room.players).find((p) => p.uid !== uid);
        if (successor) await update(metaRef(roomId), { hostId: successor.uid });
      }
      await onDisconnect(playerRef(roomId)).cancel();
      await onDisconnect(stateRef(roomId)).cancel();
      await remove(playerRef(roomId));
      await remove(stateRef(roomId));
      const remaining = room ? Object.keys(room.players).length - 1 : 0;
      if (remaining <= 0) {
        await remove(ref(db, `rooms/${roomId}`));
        await remove(indexRef(roomId));
      } else {
        await update(indexRef(roomId), { playerCount: remaining, updatedAt: serverTimestamp() });
      }
    },

    async ensureHost(roomId) {
      const room = await readRoom(roomId);
      if (!room || room.players[room.meta.hostId]) return;
      const survivors = playersByJoinOrder(room.players);
      if (survivors[0]?.uid === uid) await update(metaRef(roomId), { hostId: uid });
    },

    dispose() {
      // Слушатели закрывают вызывающие через unsubscribe из listRooms/subscribeRoom.
    },
  };
}

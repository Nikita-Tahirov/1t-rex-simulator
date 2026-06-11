import {
  get,
  onDisconnect,
  onValue,
  ref,
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
import { SWEEP_MIN_INTERVAL_MS, sweepCandidates } from './roomSweep.ts';
import { normalizeRoom, normalizeRoomList } from './snapshotMapping.ts';
import { MAX_PLAYERS, type RoomSnapshot } from './types.ts';
import { NET_OP_TIMEOUT_MS, withTimeout } from './withTimeout.ts';

/**
 * Реализация `NetworkPort` поверх Firebase Realtime Database + Anonymous Auth.
 *
 * Модель: каждый клиент пишет только свои `players/$uid` и `states/$uid`; host —
 * `meta`. Presence — через `onDisconnect` (узлы игрока/состояния удаляются при
 * обрыве). Лёгкий `roomsIndex` обслуживает общий список комнат. Внешний JSON
 * нормализуется на границе (`snapshotMapping`).
 *
 * Согласованность: связанные записи (создание комнаты, смена статуса в meta и
 * в индексе) выполняются ОДНИМ атомарным multi-path `update` — раньше серия
 * отдельных await'ов оставляла комнату без индекса или индекс без комнаты при
 * обрыве посередине. `playerCount` индекса всегда пересчитывается из СВЕЖЕГО
 * снапшота `players` после своей записи (самокорректирующийся), а не из
 * прочитанного до неё (гонка двух одновременных входов/выходов). Комнаты-призраки
 * подчищает opportunistic-уборка при подписке на список (`roomSweep`).
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
  let lastSweepAt = 0;

  /**
   * Все пользовательские операции — под потолком ожидания: при недоступном
   * RTDB-сокете SDK ставит записи в очередь и промисы не разрешаются никогда,
   * а UI молча виснет (см. withTimeout.ts). Reject уходит в setError UI.
   */
  const guard = <T>(label: string, op: () => Promise<T>): Promise<T> =>
    withTimeout(op(), NET_OP_TIMEOUT_MS, label);

  const readRoom = async (roomId: string): Promise<RoomSnapshot | null> => {
    const snapshot = await get(ref(db, `rooms/${roomId}`));
    return snapshot.exists() ? normalizeRoom(roomId, snapshot.val()) : null;
  };

  // Порядок важен: сначала вешаем onDisconnect-удаление, затем пишем онлайн-узел.
  const armPresence = async (roomId: string): Promise<void> => {
    await onDisconnect(playerRef(roomId)).remove();
    await onDisconnect(stateRef(roomId)).remove();
  };

  /**
   * Удалить комнату вместе с записью в индексе ОДНИМ атомарным multi-path
   * update: две отдельные remove() при обрыве между ними оставляли осиротевший
   * индекс до следующей уборки. Правила пускают удаление только при пустых
   * `players` (или участником), поэтому ожившую комнату снести нельзя.
   */
  const removeRoomEverywhere = (roomId: string): Promise<void> =>
    update(ref(db), {
      [`rooms/${roomId}`]: null,
      [`roomsIndex/${roomId}`]: null,
    });

  /**
   * Пересчитать `playerCount` индекса из СВЕЖЕГО `players`; пустая комната
   * удаляется целиком (правила это разрешают: players пуст). Самокорректирует
   * любую гонку join/leave: побеждает последний пересчёт, а не stale-снимок.
   */
  const reconcileIndex = async (roomId: string): Promise<void> => {
    const snap = await get(ref(db, `rooms/${roomId}/players`));
    const count = snap.exists() ? Object.keys(snap.val() as Record<string, unknown>).length : 0;
    if (count === 0) {
      await removeRoomEverywhere(roomId);
      return;
    }
    await update(indexRef(roomId), { playerCount: count, updatedAt: serverTimestamp() });
  };

  /** Удалить комнаты-кандидаты, чей `players` фактически пуст (см. roomSweep). */
  const sweep = (ids: string[]): void => {
    for (const roomId of ids) {
      void get(ref(db, `rooms/${roomId}/players`))
        .then(async (snap) => {
          if (snap.exists()) return;
          await removeRoomEverywhere(roomId);
        })
        .catch(() => {
          // Гонка с другим уборщиком/живой комнатой — безопасно игнорируем.
        });
    }
  };

  return {
    uid,
    kind: 'firebase',

    listRooms(callback) {
      return onValue(ref(db, 'roomsIndex'), (snap) => {
        const rooms = normalizeRoomList(snap.val());
        callback(rooms);
        const now = Date.now();
        if (now - lastSweepAt >= SWEEP_MIN_INTERVAL_MS) {
          lastSweepAt = now;
          sweep(sweepCandidates(rooms, now));
        }
      });
    },

    subscribeRoom(roomId, callback) {
      return onValue(ref(db, `rooms/${roomId}`), (snap) =>
        callback(snap.exists() ? normalizeRoom(roomId, snap.val()) : null),
      );
    },

    watchConnected(callback) {
      // `.info/connected` — серверная истина о соединении: false при блокировке
      // сокета (auth при этом может быть успешным). UI предупреждает игрока.
      return onValue(ref(db, '.info/connected'), (snap) => callback(snap.val() === true));
    },

    createRoom(roomName, playerName) {
      return guard('Создание комнаты', async () => {
        const roomId = randomId('room');
        const name = clampName(roomName, 'Комната');
        // Один атомарный multi-path: комната появляется сразу с host-игроком и
        // записью в индексе — либо целиком, либо никак (нет «невидимых» комнат).
        await update(ref(db), {
          [`rooms/${roomId}/meta`]: {
            roomId,
            name,
            hostId: uid,
            status: 'lobby',
            arenaSeed: 0,
            maxPlayers: MAX_PLAYERS,
            createdAt: serverTimestamp(),
            countdownEndsAt: null,
            winnerId: null,
          },
          [`rooms/${roomId}/players/${uid}`]: {
            name: clampName(playerName, 'Пилот'),
            colorIndex: 0,
            ready: false,
            joinedAt: serverTimestamp(),
            presence: true,
          },
          [`roomsIndex/${roomId}`]: {
            name,
            status: 'lobby',
            playerCount: 1,
            maxPlayers: MAX_PLAYERS,
            hostId: uid,
            updatedAt: serverTimestamp(),
          },
        });
        await armPresence(roomId);
        return roomId;
      });
    },

    joinRoom(roomId, playerName) {
      return guard('Вход в комнату', async () => {
        const room = await readRoom(roomId);
        if (!room) throw new Error('Комната не найдена');
        if (room.meta.status !== 'lobby') throw new Error('Бой уже идёт или завершён');
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
        await reconcileIndex(roomId);
      });
    },

    setReady(roomId, ready) {
      return guard('Смена готовности', () => update(playerRef(roomId), { ready }));
    },

    startMatch(roomId) {
      return guard('Старт боя', async () => {
        const room = await readRoom(roomId);
        if (!room || room.meta.hostId !== uid) return;
        // Статусы meta и индекса меняются атомарно — иначе обрыв между записями
        // оставлял комнату «lobby» в списке при уже идущем бое.
        await update(ref(db), {
          [`rooms/${roomId}/meta/status`]: 'active',
          [`rooms/${roomId}/meta/arenaSeed`]: Math.floor(Math.random() * 0xffffffff) >>> 0,
          [`rooms/${roomId}/meta/corners`]: assignStartCorners(room.players),
          [`rooms/${roomId}/meta/countdownEndsAt`]: Date.now() + COUNTDOWN_MS,
          [`roomsIndex/${roomId}/status`]: 'active',
          [`roomsIndex/${roomId}/updatedAt`]: serverTimestamp(),
        });
      });
    },

    publishState(roomId, state) {
      void set(stateRef(roomId), state);
    },

    finishMatch(roomId, winnerId) {
      return guard('Завершение боя', async () => {
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
      });
    },

    rematch(roomId) {
      return guard('Реванш', async () => {
        const room = await readRoom(roomId);
        if (!room || room.meta.hostId !== uid) return;
        await update(ref(db), {
          [`rooms/${roomId}/meta/status`]: 'lobby',
          [`rooms/${roomId}/meta/winnerId`]: null,
          [`rooms/${roomId}/meta/arenaSeed`]: 0,
          [`rooms/${roomId}/meta/corners`]: null,
          [`rooms/${roomId}/meta/countdownEndsAt`]: null,
          [`roomsIndex/${roomId}/status`]: 'lobby',
          [`roomsIndex/${roomId}/updatedAt`]: serverTimestamp(),
        });
      });
    },

    leaveRoom(roomId) {
      return guard('Выход из комнаты', async () => {
        const room = await readRoom(roomId);
        if (room && room.meta.hostId === uid) {
          const successor = playersByJoinOrder(room.players).find((p) => p.uid !== uid);
          if (successor) await update(metaRef(roomId), { hostId: successor.uid });
        }
        await onDisconnect(playerRef(roomId)).cancel();
        await onDisconnect(stateRef(roomId)).cancel();
        // Свой player+state удаляются одним атомарным multi-path update.
        await update(ref(db), {
          [`rooms/${roomId}/players/${uid}`]: null,
          [`rooms/${roomId}/states/${uid}`]: null,
        });
        await reconcileIndex(roomId);
      });
    },

    ensureHost(roomId) {
      return guard('Передача роли хозяина', async () => {
        const room = await readRoom(roomId);
        if (!room || room.players[room.meta.hostId]) return;
        const survivors = playersByJoinOrder(room.players);
        if (survivors[0]?.uid === uid) await update(metaRef(roomId), { hostId: uid });
      });
    },

    dispose() {
      // Слушатели закрывают вызывающие через unsubscribe из listRooms/subscribeRoom.
    },
  };
}

import { useCallback, useEffect, useRef } from 'react';
import { createNetworkPort } from '../net/createNetworkPort.ts';
import type { NetworkPort } from '../net/NetworkPort.ts';
import type { PlayerState, RoomListItem, RoomSnapshot, Unsubscribe } from '../net/types.ts';
import { useAppModeStore } from '../store/appModeStore.ts';
import { useNetRoomStore } from '../store/netRoomStore.ts';

/**
 * Хук-оркестратор сетевой сессии: создаёт порт, держит подписки на список комнат
 * и текущую комнату, и предоставляет действия лобби. Вызывается ОДИН раз в
 * `NetSessionProvider`; результат раздаётся экранам через контекст.
 *
 * Порт создаётся асинхронно (auth/инициализация) — до готовности действия
 * безопасно no-op. Подписки и порт закрываются при выходе из сетевого режима.
 */
export interface NetSession {
  uid: string | null;
  rooms: RoomListItem[];
  room: RoomSnapshot | null;
  error: string | null;
  ready: boolean;
  createRoom: (name: string) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  startMatch: () => Promise<void>;
  leaveRoom: () => Promise<void>;
  publishState: (state: PlayerState) => void;
  finishMatch: (winnerId: string | null) => Promise<void>;
  rematch: () => Promise<void>;
  ensureHost: () => Promise<void>;
}

export function useNetSession(): NetSession {
  const portRef = useRef<NetworkPort | null>(null);
  const rooms = useNetRoomStore((s) => s.rooms);
  const room = useNetRoomStore((s) => s.room);
  const error = useNetRoomStore((s) => s.error);
  const uid = useNetRoomStore((s) => s.uid);
  const roomId = useNetRoomStore((s) => s.roomId);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __netRoomStore?: typeof useNetRoomStore }).__netRoomStore =
        useNetRoomStore;
    }
    let cancelled = false;
    let unsubList: Unsubscribe | undefined;
    void createNetworkPort().then((port) => {
      if (cancelled) {
        port.dispose();
        return;
      }
      portRef.current = port;
      useNetRoomStore.getState().setUid(port.uid);
      unsubList = port.listRooms((next) => useNetRoomStore.getState().setRooms(next));
    });
    // Намеренно НЕ сбрасываем roomId в cleanup: провайдер может пере-монтироваться
    // (StrictMode, всплывший Suspense боевой сцены), и сброс выкинул бы игрока из
    // комнаты. Членство в комнате переживает remount; чистый старт делает enterNet.
    return () => {
      cancelled = true;
      unsubList?.();
      portRef.current?.dispose();
      portRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!roomId) {
      useNetRoomStore.getState().setRoom(null);
      return;
    }
    const port = portRef.current;
    if (!port) return;
    const unsub = port.subscribeRoom(roomId, (next) => useNetRoomStore.getState().setRoom(next));
    return unsub;
  }, [roomId]);

  const createRoom = useCallback(async (name: string) => {
    const port = portRef.current;
    if (!port) return;
    try {
      const newRoomId = await port.createRoom(name, useNetRoomStore.getState().playerName);
      useNetRoomStore.getState().setRoomId(newRoomId);
      useNetRoomStore.getState().setError(null);
    } catch (caught) {
      useNetRoomStore.getState().setError(errorText(caught));
    }
  }, []);

  const joinRoom = useCallback(async (targetRoomId: string) => {
    const port = portRef.current;
    if (!port) return;
    try {
      await port.joinRoom(targetRoomId, useNetRoomStore.getState().playerName);
      useNetRoomStore.getState().setRoomId(targetRoomId);
      useNetRoomStore.getState().setError(null);
    } catch (caught) {
      useNetRoomStore.getState().setError(errorText(caught));
    }
  }, []);

  const setReady = useCallback(
    async (value: boolean) => {
      const port = portRef.current;
      if (port && roomId) await port.setReady(roomId, value);
    },
    [roomId],
  );

  const startMatch = useCallback(async () => {
    const port = portRef.current;
    if (port && roomId) await port.startMatch(roomId);
  }, [roomId]);

  const leaveRoom = useCallback(async () => {
    const port = portRef.current;
    if (port && roomId) await port.leaveRoom(roomId);
    useNetRoomStore.getState().leaveRoom();
    useAppModeStore.getState().setNetScreen('rooms');
  }, [roomId]);

  const publishState = useCallback(
    (state: PlayerState) => {
      const port = portRef.current;
      if (port && roomId) port.publishState(roomId, state);
    },
    [roomId],
  );

  const finishMatch = useCallback(
    async (winnerId: string | null) => {
      const port = portRef.current;
      if (port && roomId) await port.finishMatch(roomId, winnerId);
    },
    [roomId],
  );

  const rematch = useCallback(async () => {
    const port = portRef.current;
    if (port && roomId) await port.rematch(roomId);
  }, [roomId]);

  const ensureHost = useCallback(async () => {
    const port = portRef.current;
    if (port && roomId) await port.ensureHost(roomId);
  }, [roomId]);

  const self = uid && room ? room.players[uid] : undefined;

  return {
    uid,
    rooms,
    room,
    error,
    ready: self?.ready ?? false,
    createRoom,
    joinRoom,
    setReady,
    startMatch,
    leaveRoom,
    publishState,
    finishMatch,
    rematch,
    ensureHost,
  };
}

function errorText(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Сетевая ошибка';
}

import { create } from 'zustand';
import type { RoomListItem, RoomSnapshot } from '../net/types.ts';

/**
 * Стор сетевой сессии: текущий uid, выбранная комната и её снимок, общий список
 * комнат, имя игрока и последняя ошибка. Это «тупой» держатель состояния —
 * оркестрацию порта (создать/войти/готов/старт) выполняет хук `useNetSession`,
 * а сюда лишь складывает результат. Так логику можно тестировать отдельно.
 */

export interface NetRoomState {
  uid: string | null;
  roomId: string | null;
  room: RoomSnapshot | null;
  rooms: RoomListItem[];
  playerName: string;
  error: string | null;

  setUid: (uid: string | null) => void;
  setRoomId: (roomId: string | null) => void;
  setRoom: (room: RoomSnapshot | null) => void;
  setRooms: (rooms: RoomListItem[]) => void;
  setPlayerName: (name: string) => void;
  setError: (error: string | null) => void;
  /** Сбросить всё, что относится к конкретной комнате (но не имя/uid). */
  leaveRoom: () => void;
}

export const useNetRoomStore = create<NetRoomState>()((set) => ({
  uid: null,
  roomId: null,
  room: null,
  rooms: [],
  playerName: '',
  error: null,

  setUid: (uid) => set({ uid }),
  setRoomId: (roomId) => set({ roomId }),
  setRoom: (room) => set({ room }),
  setRooms: (rooms) => set({ rooms }),
  setPlayerName: (playerName) => set({ playerName }),
  setError: (error) => set({ error }),
  leaveRoom: () => set({ roomId: null, room: null, error: null }),
}));

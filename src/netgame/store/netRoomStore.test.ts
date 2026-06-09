import { beforeEach, describe, expect, it } from 'vitest';
import type { RoomSnapshot } from '../net/types.ts';
import { useNetRoomStore } from './netRoomStore.ts';

function makeRoom(): RoomSnapshot {
  return {
    meta: {
      roomId: 'r1',
      name: 'Арена',
      hostId: 'a',
      status: 'lobby',
      arenaSeed: 0,
      maxPlayers: 4,
      createdAt: 0,
      countdownEndsAt: null,
      winnerId: null,
      corners: {},
    },
    players: {},
    states: {},
  };
}

describe('netRoomStore', () => {
  beforeEach(() => {
    useNetRoomStore.setState({
      uid: null,
      roomId: null,
      room: null,
      rooms: [],
      playerName: '',
      error: null,
    });
  });

  it('сохраняет uid, имя и текущую комнату', () => {
    const store = useNetRoomStore.getState();
    store.setUid('uid-1');
    store.setPlayerName('Пилот');
    store.setRoomId('r1');
    store.setRoom(makeRoom());
    const next = useNetRoomStore.getState();
    expect(next.uid).toBe('uid-1');
    expect(next.playerName).toBe('Пилот');
    expect(next.roomId).toBe('r1');
    expect(next.room?.meta.roomId).toBe('r1');
  });

  it('leaveRoom сбрасывает комнату, но сохраняет uid и имя', () => {
    const store = useNetRoomStore.getState();
    store.setUid('uid-1');
    store.setPlayerName('Пилот');
    store.setRoomId('r1');
    store.setRoom(makeRoom());
    store.setError('boom');
    useNetRoomStore.getState().leaveRoom();
    const next = useNetRoomStore.getState();
    expect(next.roomId).toBeNull();
    expect(next.room).toBeNull();
    expect(next.error).toBeNull();
    expect(next.uid).toBe('uid-1');
    expect(next.playerName).toBe('Пилот');
  });
});

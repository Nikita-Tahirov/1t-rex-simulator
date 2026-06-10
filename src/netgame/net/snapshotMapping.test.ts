import { describe, expect, it } from 'vitest';
import {
  normalizeMeta,
  normalizePlayer,
  normalizeRoom,
  normalizeRoomList,
  normalizeState,
} from './snapshotMapping.ts';

describe('snapshotMapping — граница unknown→typed', () => {
  it('подставляет дефолты для битого meta', () => {
    const meta = normalizeMeta('r1', { status: 'bogus', name: 42, corners: { a: '3' } });
    expect(meta.roomId).toBe('r1');
    expect(meta.status).toBe('lobby');
    expect(meta.name).toBe('Комната');
    expect(meta.corners).toEqual({ a: 0 });
    expect(meta.winnerId).toBeNull();
  });

  it('нормализует игрока и состояние из частичных данных', () => {
    expect(normalizePlayer('u1', { name: 'X', ready: true })).toMatchObject({
      uid: 'u1',
      name: 'X',
      ready: true,
      colorIndex: 0,
    });
    expect(normalizeState({ x: 1.5, health: 700, alive: true })).toMatchObject({
      x: 1.5,
      z: 0,
      health: 700,
      alive: true,
      spinnerRpm: 0,
      dealt: {},
    });
  });

  it('нормализует spinnerRpm и dealt, отбрасывая мусор', () => {
    const state = normalizeState({
      x: 0,
      spinnerRpm: 4200,
      dealt: { victimA: 130, victimB: '5', victimC: -3 },
    });
    expect(state.spinnerRpm).toBe(4200);
    // строка и отрицательное отбрасываются, остаётся положительное число.
    expect(state.dealt).toEqual({ victimA: 130 });
  });

  it('нормализует полную комнату; возвращает null без meta', () => {
    const room = normalizeRoom('r1', {
      meta: { hostId: 'a', status: 'active' },
      players: { a: { name: 'A' }, b: { name: 'B' } },
      states: { a: { health: 1000, alive: true } },
    });
    expect(room?.meta.status).toBe('active');
    expect(Object.keys(room?.players ?? {})).toHaveLength(2);
    expect(room?.states.a?.health).toBe(1000);
    expect(normalizeRoom('r1', { players: {} })).toBeNull();
  });

  it('нормализует список комнат и сортирует', () => {
    const list = normalizeRoomList({
      a1: { name: 'A', status: 'lobby', playerCount: 1, hostId: 'h1' },
      b2: { name: 'B', status: 'active', playerCount: 2, hostId: 'h2' },
    });
    expect(list).toHaveLength(2);
    expect(list[0]?.roomId).toBe('b2');
    expect(list[0]?.playerCount).toBe(2);
  });
});

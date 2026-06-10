import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInMemoryPort } from './inMemoryAdapter.ts';
import { inMemoryBackend } from './inMemoryBackend.ts';
import { allReady, canStartMatch } from './lobby.ts';
import { computeWinner } from './match.ts';
import type { NetworkPort } from './NetworkPort.ts';
import type { PlayerState } from './types.ts';

function liveState(health: number): PlayerState {
  return {
    x: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    spinnerRpm: 0,
    health,
    alive: health > 0,
    seq: 1,
    t: 0,
    dealt: {},
  };
}

describe('inMemoryAdapter — поток лобби и боя', () => {
  let host: NetworkPort;
  let guest: NetworkPort;

  beforeEach(() => {
    inMemoryBackend.reset();
    host = createInMemoryPort('host-uid');
    guest = createInMemoryPort('guest-uid');
  });

  afterEach(() => {
    host.dispose();
    guest.dispose();
  });

  it('создаёт комнату, хозяин входит в угол 0 и виден в списке', async () => {
    const roomId = await host.createRoom('Арена A', 'Хост');
    const room = inMemoryBackend.getRoom(roomId);
    expect(room?.meta.status).toBe('lobby');
    expect(room?.meta.hostId).toBe('host-uid');
    expect(room?.players['host-uid']?.colorIndex).toBe(0);
    expect(inMemoryBackend.roomList()).toHaveLength(1);
  });

  it('второй игрок входит в следующий свободный угол', async () => {
    const roomId = await host.createRoom('Арена A', 'Хост');
    await guest.joinRoom(roomId, 'Гость');
    const room = inMemoryBackend.getRoom(roomId)!;
    expect(Object.keys(room.players)).toHaveLength(2);
    expect(room.players['guest-uid']?.colorIndex).toBe(1);
  });

  it('старт доступен только хозяину при ≥2 готовых', async () => {
    const roomId = await host.createRoom('Арена A', 'Хост');
    await guest.joinRoom(roomId, 'Гость');
    await host.setReady(roomId, true);
    let room = inMemoryBackend.getRoom(roomId)!;
    expect(allReady(room.players)).toBe(false);
    await guest.setReady(roomId, true);
    room = inMemoryBackend.getRoom(roomId)!;
    expect(allReady(room.players)).toBe(true);
    expect(canStartMatch(room, 'host-uid')).toBe(true);
    expect(canStartMatch(room, 'guest-uid')).toBe(false);
  });

  it('старт боя фиксирует статус, сид и углы; гость стартовать не может', async () => {
    const roomId = await host.createRoom('Арена A', 'Хост');
    await guest.joinRoom(roomId, 'Гость');
    await guest.startMatch(roomId); // не хозяин — игнор
    expect(inMemoryBackend.getRoom(roomId)?.meta.status).toBe('lobby');
    await host.startMatch(roomId);
    const room = inMemoryBackend.getRoom(roomId)!;
    expect(room.meta.status).toBe('active');
    expect(room.meta.countdownEndsAt).toBeGreaterThan(0);
    expect(room.meta.corners).toEqual({ 'host-uid': 0, 'guest-uid': 1 });
  });

  it('финал фиксирует победителя по последнему живому', async () => {
    const roomId = await host.createRoom('Арена A', 'Хост');
    await guest.joinRoom(roomId, 'Гость');
    await host.startMatch(roomId);
    host.publishState(roomId, liveState(800));
    guest.publishState(roomId, liveState(0));
    const room = inMemoryBackend.getRoom(roomId)!;
    const outcome = computeWinner(room.players, room.states);
    expect(outcome).toEqual({ decided: true, winnerId: 'host-uid' });
    await host.finishMatch(roomId, outcome.winnerId);
    expect(inMemoryBackend.getRoom(roomId)?.meta.status).toBe('finished');
    expect(inMemoryBackend.getRoom(roomId)?.meta.winnerId).toBe('host-uid');
  });

  it('выход хозяина передаёт роль следующему по входу', async () => {
    const roomId = await host.createRoom('Арена A', 'Хост');
    await guest.joinRoom(roomId, 'Гость');
    await host.leaveRoom(roomId);
    const room = inMemoryBackend.getRoom(roomId)!;
    expect(room.meta.hostId).toBe('guest-uid');
    expect(room.players['host-uid']).toBeUndefined();
  });

  it('нельзя войти в заполненную комнату', async () => {
    const roomId = await host.createRoom('Арена A', 'Хост');
    const ports = ['p1', 'p2', 'p3'].map((id) => createInMemoryPort(id));
    await ports[0]!.joinRoom(roomId, 'P1');
    await ports[1]!.joinRoom(roomId, 'P2');
    await ports[2]!.joinRoom(roomId, 'P3');
    const extra = createInMemoryPort('p4');
    await expect(extra.joinRoom(roomId, 'P4')).rejects.toThrow('заполнена');
    for (const p of ports) p.dispose();
    extra.dispose();
  });
});

import { describe, expect, it } from 'vitest';
import {
  assignStartCorners,
  computeWinner,
  countAliveParticipants,
  nextColorIndex,
  winnerByHealth,
} from './match.ts';
import type { PlayerInfo, PlayerState } from './types.ts';

function player(uid: string, colorIndex: number, joinedAt: number): PlayerInfo {
  return { uid, name: uid, colorIndex, ready: false, joinedAt, presence: true };
}

function state(health: number, alive = health > 0): PlayerState {
  return { x: 0, z: 0, yaw: 0, speed: 0, spinnerRpm: 0, health, alive, seq: 1, t: 0, dealt: {} };
}

function asMap<T>(entries: Array<[string, T]>): Record<string, T> {
  return Object.fromEntries(entries);
}

describe('nextColorIndex', () => {
  it('выдаёт первый свободный угол', () => {
    expect(nextColorIndex({})).toBe(0);
    expect(nextColorIndex(asMap([['a', player('a', 0, 1)]]))).toBe(1);
    expect(
      nextColorIndex(
        asMap([
          ['a', player('a', 0, 1)],
          ['c', player('c', 2, 3)],
        ]),
      ),
    ).toBe(1);
  });
});

describe('assignStartCorners', () => {
  it('компактит углы 0..N-1 в порядке цвета из лобби, убирая дыры', () => {
    const players = asMap([
      ['b', player('b', 3, 20)],
      ['a', player('a', 1, 10)],
      ['c', player('c', 2, 30)],
    ]);
    // colorIndex 1,2,3 → ранги 0,1,2 (соответствие цвет ↔ угол сохранено)
    expect(assignStartCorners(players)).toEqual({ a: 0, c: 1, b: 2 });
  });
});

describe('countAliveParticipants', () => {
  it('считает участника без снимка живым', () => {
    const players = asMap([
      ['a', player('a', 0, 1)],
      ['b', player('b', 1, 2)],
    ]);
    expect(countAliveParticipants(players, {})).toBe(2);
    expect(countAliveParticipants(players, asMap([['a', state(0)]]))).toBe(1);
  });
});

describe('computeWinner', () => {
  const players = asMap([
    ['a', player('a', 0, 1)],
    ['b', player('b', 1, 2)],
  ]);

  it('не решён, пока живы двое', () => {
    expect(
      computeWinner(
        players,
        asMap([
          ['a', state(500)],
          ['b', state(500)],
        ]),
      ),
    ).toEqual({
      decided: false,
      winnerId: null,
    });
  });

  it('победитель — единственный живой', () => {
    expect(
      computeWinner(
        players,
        asMap([
          ['a', state(500)],
          ['b', state(0)],
        ]),
      ),
    ).toEqual({
      decided: true,
      winnerId: 'a',
    });
  });

  it('ничья при взаимном уничтожении', () => {
    expect(
      computeWinner(
        players,
        asMap([
          ['a', state(0)],
          ['b', state(0)],
        ]),
      ),
    ).toEqual({
      decided: true,
      winnerId: null,
    });
  });

  it('единственный оставшийся в комнате — победитель', () => {
    const solo = asMap([['a', player('a', 0, 1)]]);
    expect(computeWinner(solo, {})).toEqual({ decided: true, winnerId: 'a' });
  });
});

describe('winnerByHealth', () => {
  const players = asMap([
    ['a', player('a', 0, 1)],
    ['b', player('b', 1, 2)],
  ]);

  it('побеждает самый целый среди живых', () => {
    expect(
      winnerByHealth(
        players,
        asMap([
          ['a', state(700)],
          ['b', state(300)],
        ]),
      ),
    ).toBe('a');
  });

  it('ничья при равном здоровье', () => {
    expect(
      winnerByHealth(
        players,
        asMap([
          ['a', state(400)],
          ['b', state(400)],
        ]),
      ),
    ).toBeNull();
  });
});

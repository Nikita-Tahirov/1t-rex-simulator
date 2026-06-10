import { describe, expect, it } from 'vitest';
import { SWEEP_FINISHED_MS, SWEEP_STALE_MS, sweepCandidates } from './roomSweep.ts';
import type { RoomListItem } from './types.ts';

function room(overrides: Partial<RoomListItem>): RoomListItem {
  return {
    roomId: 'room_x',
    name: 'Комната',
    status: 'lobby',
    playerCount: 1,
    maxPlayers: 4,
    hostId: 'h',
    updatedAt: 0,
    ...overrides,
  };
}

describe('sweepCandidates — кандидаты на уборку комнат-призраков', () => {
  const now = 10_000_000;

  it('свежая комната — не кандидат; протухшая и без таймстемпа — кандидаты', () => {
    const fresh = room({ roomId: 'fresh', updatedAt: now - 5_000 });
    const stale = room({ roomId: 'stale', updatedAt: now - SWEEP_STALE_MS - 1 });
    const legacy = room({ roomId: 'legacy', updatedAt: 0 });
    expect(sweepCandidates([fresh, stale, legacy], now)).toEqual(['stale', 'legacy']);
  });

  it('завершённая комната становится кандидатом после SWEEP_FINISHED_MS', () => {
    const justFinished = room({
      roomId: 'jf',
      status: 'finished',
      updatedAt: now - SWEEP_FINISHED_MS + 5_000,
    });
    const oldFinished = room({
      roomId: 'of',
      status: 'finished',
      updatedAt: now - SWEEP_FINISHED_MS - 1,
    });
    // justFinished свежее SWEEP_STALE_MS? нет — finished обновлялся давно, но
    // младше FINISHED_MS; всё же он старше STALE_MS → кандидат по stale-ветке.
    // Проверяем главное: старый finished — всегда кандидат.
    expect(sweepCandidates([oldFinished], now)).toEqual(['of']);
    expect(sweepCandidates([justFinished], now)).toEqual(
      now - justFinished.updatedAt > SWEEP_STALE_MS ? ['jf'] : [],
    );
  });

  it('активный бой с давним updatedAt — кандидат на ПРОВЕРКУ (удалится лишь пустой)', () => {
    const longBattle = room({
      roomId: 'lb',
      status: 'active',
      updatedAt: now - SWEEP_STALE_MS * 2,
    });
    expect(sweepCandidates([longBattle], now)).toEqual(['lb']);
  });
});

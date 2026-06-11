import { afterEach, describe, expect, it } from 'vitest';
import { drainHits, type HitEvent, pushHit, resetHitFeed } from './battleHitFeed.ts';

afterEach(() => resetHitFeed());

describe('battleHitFeed — лента событий попаданий', () => {
  it('push → drain отдаёт события по порядку и опустошает очередь', () => {
    pushHit('a', 26, 'dealt');
    pushHit('me', 14, 'taken');
    const out: HitEvent[] = [];
    drainHits(out);
    expect(out).toEqual([
      { uid: 'a', amount: 26, kind: 'dealt' },
      { uid: 'me', amount: 14, kind: 'taken' },
    ]);
    drainHits(out);
    expect(out).toHaveLength(0);
  });

  it('нулевой/отрицательный/NaN урон игнорируется', () => {
    pushHit('a', 0, 'dealt');
    pushHit('a', -5, 'taken');
    pushHit('a', Number.NaN, 'dealt');
    const out: HitEvent[] = [];
    drainHits(out);
    expect(out).toHaveLength(0);
  });

  it('очередь капится FIFO: старейшие события вытесняются, новые остаются', () => {
    for (let i = 1; i <= 20; i += 1) pushHit('a', i, 'dealt');
    const out: HitEvent[] = [];
    drainHits(out);
    expect(out).toHaveLength(16);
    expect(out[0]!.amount).toBe(5); // 1..4 вытеснены
    expect(out[15]!.amount).toBe(20);
  });

  it('reset очищает очередь', () => {
    pushHit('a', 10, 'dealt');
    resetHitFeed();
    const out: HitEvent[] = [];
    drainHits(out);
    expect(out).toHaveLength(0);
  });
});

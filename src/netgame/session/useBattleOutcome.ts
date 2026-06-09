import { useEffect } from 'react';
import { computeWinner, winnerByHealth } from '../net/match.ts';
import { useNetRoomStore } from '../store/netRoomStore.ts';
import type { NetSession } from './useNetSession.ts';

/**
 * Определение исхода боя — распределённо, но финал пишет ровно host.
 *
 * Каждый клиент считает победителя одинаково по общему состоянию, но
 * `finishMatch` (запись в meta) разрешена только host'у — так избегаем гонки
 * записи. `ensureHost` подхватывает роль, если прежний host отключился.
 *
 * Решение откладывается до конца обратного отсчёта: за это время каждый клиент
 * успевает опубликовать свежее «живое» состояние, затирая мёртвые снимки
 * прошлого матча (иначе реванш завершился бы мгновенно). Wake-таймер читает
 * СВЕЖЕЕ состояние из стора (`getState`), а не устаревшее замыкание. Страховочный
 * таймер завершает затянувшийся бой по наибольшему здоровью.
 */
export function useBattleOutcome(session: NetSession, matchTimeoutMs: number): void {
  const { room, uid, finishMatch, ensureHost } = session;

  useEffect(() => {
    if (!room || !uid || room.meta.status !== 'active') return;
    void ensureHost();
    if (room.meta.hostId !== uid) return;

    const finalize = (): void => {
      const current = useNetRoomStore.getState().room;
      if (!current || current.meta.status !== 'active' || current.meta.hostId !== uid) return;
      const countdownEnd = current.meta.countdownEndsAt ?? current.meta.createdAt;
      if (Date.now() < countdownEnd) return;
      const outcome = computeWinner(current.players, current.states);
      if (outcome.decided) {
        void finishMatch(outcome.winnerId);
      } else if (Date.now() >= countdownEnd + matchTimeoutMs) {
        void finishMatch(winnerByHealth(current.players, current.states));
      }
    };

    const now = Date.now();
    const countdownEnd = room.meta.countdownEndsAt ?? room.meta.createdAt;
    if (now < countdownEnd) {
      const wake = setTimeout(finalize, countdownEnd - now + 50);
      return () => clearTimeout(wake);
    }

    finalize();
    const remaining = countdownEnd + matchTimeoutMs - now;
    if (remaining > 0) {
      const timer = setTimeout(finalize, remaining);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [room, uid, finishMatch, ensureHost, matchTimeoutMs]);
}

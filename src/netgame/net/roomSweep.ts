import type { RoomListItem } from './types.ts';

/**
 * Opportunistic-уборка комнат-призраков из общего списка.
 *
 * Presence (`onDisconnect`) удаляет только `players/$uid` и `states/$uid`
 * упавшего клиента: `rooms/$roomId/meta` и `roomsIndex/$roomId` никто не
 * чистит, поэтому после краха/закрытия вкладки хоста комната оставалась в
 * списке навсегда (наблюдалось на проде). Любой клиент, открывший список,
 * проверяет «кандидатов» (давно не обновлялись или давно завершены) и удаляет
 * те, чей узел `players` фактически пуст. Живые комнаты (есть игроки) не
 * трогаются независимо от возраста; гонка двух уборщиков идемпотентна.
 */

/** Запись не обновлялась дольше этого — кандидат на проверку пустоты. */
export const SWEEP_STALE_MS = 90_000;
/** Завершённые комнаты живут в списке не дольше этого. */
export const SWEEP_FINISHED_MS = 10 * 60_000;
/** Минимальный интервал между уборками с одного клиента. */
export const SWEEP_MIN_INTERVAL_MS = 60_000;

/** Комнаты, которые стоит проверить на пустоту players (и удалить, если пусто). */
export function sweepCandidates(rooms: RoomListItem[], nowMs: number): string[] {
  const ids: string[] = [];
  for (const room of rooms) {
    const age = nowMs - room.updatedAt;
    // updatedAt=0 — запись без таймстемпа (старый формат) — тоже кандидат.
    const stale = room.updatedAt === 0 || age > SWEEP_STALE_MS;
    const finishedLongAgo = room.status === 'finished' && age > SWEEP_FINISHED_MS;
    if (stale || finishedLongAgo) ids.push(room.roomId);
  }
  return ids;
}

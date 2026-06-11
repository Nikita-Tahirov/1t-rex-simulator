/**
 * Лента событий попаданий боя (module-state, как `battleKnockback`): источники
 * урона пушат события, `DamagePopups` дренит их раз в кадр и показывает
 * всплывающие числа. Очередь капится FIFO — потеря старого события безвредна
 * (это индикация, доказательство урона — накопитель `dealt` и health).
 */

export type HitKind = 'dealt' | 'taken';

export interface HitEvent {
  /** Над чьим роботом показать число (uid в реестре `battlePoses`). */
  uid: string;
  amount: number;
  /** `dealt` — мой урон сопернику; `taken` — урон по мне (PvP или стена). */
  kind: HitKind;
}

const MAX_QUEUE = 16;
const queue: HitEvent[] = [];

/** Добавляет событие попадания (игнорирует нулевой/отрицательный урон). */
export function pushHit(uid: string, amount: number, kind: HitKind): void {
  if (!(amount > 0)) return;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ uid, amount, kind });
}

/**
 * Переливает накопленные события в переданный массив (scratch вызывающего,
 * очищается перед заполнением) и опустошает очередь. Без аллокаций при пустой
 * очереди — годится для вызова каждый кадр.
 */
export function drainHits(out: HitEvent[]): void {
  out.length = 0;
  if (queue.length === 0) return;
  for (const hit of queue) out.push(hit);
  queue.length = 0;
}

/** Сброс ленты (старт/рематч боя). */
export function resetHitFeed(): void {
  queue.length = 0;
}

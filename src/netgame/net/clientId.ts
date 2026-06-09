/**
 * Идентификатор клиента для сетевого режима.
 *
 * Для in-memory адаптера это uid сессии, сохранённый в `sessionStorage` —
 * намеренно ПЕР-ВКЛАДКА: две вкладки одного origin должны быть РАЗНЫМИ игроками
 * (localStorage у них общий и дал бы один uid). sessionStorage переживает
 * перезагрузку вкладки, но уникален на вкладку — ровно то, что нужно для
 * локального демо в нескольких окнах. Для Firebase uid выдаёт Anonymous Auth.
 */

const STORAGE_KEY = '1trex-net-uid';

/** Случайный короткий id с префиксом (`prefix_xxxxxxxxxxxx`). */
export function randomId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${raw.replace(/-/g, '').slice(0, 12)}`;
}

/** Стабильный uid этого клиента (персистится в sessionStorage, если доступен). */
export function getClientId(): string {
  if (typeof sessionStorage === 'undefined') return randomId('uid');
  let id = sessionStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = randomId('uid');
    sessionStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

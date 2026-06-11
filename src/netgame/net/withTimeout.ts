/**
 * Потолок ожидания сетевой операции порта.
 *
 * Firebase RTDB при недоступном сокете (блокировщик, корп-файрвол, VPN, обрыв
 * Wi-Fi) ставит записи в локальную очередь, и промис `set/update` не
 * разрешается НИКОГДА — Anonymous Auth при этом проходит (другой хост), поэтому
 * деградации в memory нет, и клик «Создать комнату» молча вис навечно
 * (pending-гард оставался true, ни лобби, ни ошибки — воспроизведено на проде
 * 2026-06-11 websocket-чёрной дырой). Таймаут превращает зависание в понятную
 * ошибку, которую UI показывает игроку.
 */
export const NET_OP_TIMEOUT_MS = 12_000;

/**
 * Обернуть промис жёстким таймаутом с человекочитаемой ошибкой.
 * Исходный reject пробрасывается как есть; таймер всегда зачищается.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${label}: сервер не ответил за ${Math.round(ms / 1000)} с — проверьте сеть и блокировщики`,
        ),
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

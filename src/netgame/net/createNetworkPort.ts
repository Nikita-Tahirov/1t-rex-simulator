import { getClientId } from './clientId.ts';
import { resolveAdapterKind } from './firebaseConfig.ts';
import { createInMemoryPort } from './inMemoryAdapter.ts';
import type { NetworkPort } from './NetworkPort.ts';

/**
 * Фабрика сетевого порта. Выбирает транспорт и резолвит uid.
 *
 * Если задан публичный Firebase web-config (`VITE_FIREBASE_*`) — лениво грузит
 * Firebase-адаптер (RTDB + Anonymous Auth) отдельным чанком. Иначе (или при сбое
 * инициализации) — in-memory адаптер: мультиплеер в нескольких вкладках одного
 * браузера через BroadcastChannel, без бэкенда. Так продакшен работает сразу, а
 * кросс-девайс включается добавлением config.
 */
export async function createNetworkPort(): Promise<NetworkPort> {
  if (resolveAdapterKind() === 'firebase') {
    try {
      const { createFirebasePort } = await import('./firebaseAdapter.ts');
      return await createFirebasePort();
    } catch {
      // Firebase недоступен/мисконфиг → деградируем до in-memory (без падения UI).
    }
  }
  return createInMemoryPort(getClientId(), { crossTab: typeof window !== 'undefined' });
}

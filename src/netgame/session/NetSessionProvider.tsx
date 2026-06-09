import type { ReactNode } from 'react';
import { NetSessionContext } from './netSessionContext.ts';
import { useNetSession } from './useNetSession.ts';

/**
 * Провайдер сетевой сессии: вызывает `useNetSession` один раз и раздаёт результат
 * экранам через контекст, чтобы не пробрасывать порт/действия пропсами. Хук
 * доступа `useNetSessionContext` живёт в `netSessionContext.ts`.
 */
export function NetSessionProvider({ children }: { children: ReactNode }) {
  const session = useNetSession();
  return <NetSessionContext.Provider value={session}>{children}</NetSessionContext.Provider>;
}

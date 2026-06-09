import { createContext, useContext } from 'react';
import type { NetSession } from './useNetSession.ts';

/**
 * Контекст сетевой сессии (отдельно от провайдера-компонента, чтобы файл
 * `NetSessionProvider.tsx` экспортировал только компонент — требование
 * react-refresh). Значение задаёт `NetSessionProvider`.
 */
export const NetSessionContext = createContext<NetSession | null>(null);

export function useNetSessionContext(): NetSession {
  const context = useContext(NetSessionContext);
  if (!context) throw new Error('useNetSessionContext вне NetSessionProvider');
  return context;
}

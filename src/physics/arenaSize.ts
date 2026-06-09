import { createContext, useContext } from 'react';
import { ARENA } from './constants.ts';

/**
 * Контекст и хук текущего размера арены (отдельно от провайдера-компонента, чтобы
 * `ArenaSizeContext.tsx` экспортировал только компонент — требование react-refresh).
 *
 * По умолчанию — `ARENA.size` (18 м): одиночка/тренировки рендерятся без
 * провайдера и видят прежнее значение. Сетевой бой оборачивает сцену в
 * `ArenaSizeProvider value={36}`. Константа `ARENA.size` не мутируется.
 */
export const ArenaSizeContext = createContext<number>(ARENA.size);

export function useArenaSize(): number {
  return useContext(ArenaSizeContext);
}

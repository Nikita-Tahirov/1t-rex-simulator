import type { ReactNode } from 'react';
import { ArenaSizeContext } from './arenaSize.ts';

/**
 * Провайдер размера арены для поддерева сцены сетевого боя. Хук `useArenaSize`
 * живёт в `arenaSize.ts`. Провайдер и потребители должны быть ВНУТРИ одного
 * `<Canvas>` — R3F-реконсайлер не пробрасывает React-контекст через границу Canvas.
 */
export function ArenaSizeProvider({ size, children }: { size: number; children: ReactNode }) {
  return <ArenaSizeContext.Provider value={size}>{children}</ArenaSizeContext.Provider>;
}

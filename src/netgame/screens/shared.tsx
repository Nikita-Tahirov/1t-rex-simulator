import type { ReactNode } from 'react';
import { PLAYER_COLORS } from '@/theme/tokens.ts';
import { useNetRoomStore } from '../store/netRoomStore.ts';
import { NET_STRINGS } from '../strings.ts';

/**
 * Общие части сетевых экранов: контейнер-панель, поле имени и цветная метка
 * игрока. Держим их вместе, чтобы не плодить крошечные файлы и единообразить
 * вид экранов лобби/боя/результата.
 */

const INPUT_CLASS =
  'w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-raised-bg)] px-3 py-2 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]';

export function NetScreenShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-auto bg-[var(--color-bg)] p-4 text-[var(--color-text)]">
      <div className="sim-panel pointer-events-auto w-full max-w-lg p-6">
        <h1 className="mb-1 text-center font-mono text-xl tracking-wide">{title}</h1>
        {subtitle && (
          <p className="mb-5 text-center text-sm text-[var(--color-text-dim)]">{subtitle}</p>
        )}
        {children}
      </div>
    </div>
  );
}

export function NameField() {
  const playerName = useNetRoomStore((s) => s.playerName);
  const setPlayerName = useNetRoomStore((s) => s.setPlayerName);
  return (
    <label className="mb-4 block text-sm">
      <span className="mb-1 block text-[var(--color-text-dim)]">{NET_STRINGS.nameLabel}</span>
      <input
        type="text"
        value={playerName}
        onChange={(event) => setPlayerName(event.target.value)}
        placeholder={NET_STRINGS.namePlaceholder}
        maxLength={24}
        aria-label={NET_STRINGS.nameLabel}
        className={INPUT_CLASS}
      />
    </label>
  );
}

export function ColorDot({ index, size = 12 }: { index: number; size?: number }) {
  const color = PLAYER_COLORS[index % PLAYER_COLORS.length]!.body;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}

export { INPUT_CLASS };

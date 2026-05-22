import { type ReactNode, useId, useState } from 'react';

const STORAGE_PREFIX = '1trex.hud.sectionCollapsed.';

function readStoredCollapsed(storageKey: string | undefined, fallback: boolean): boolean {
  if (!storageKey || typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}

function writeStoredCollapsed(storageKey: string | undefined, collapsed: boolean): void {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, String(collapsed));
  } catch {
    // Хранилище может быть недоступно в private mode; UI остаётся рабочим без persistence.
  }
}

/**
 * Базовая карточка HUD: мягкая glass-поверхность в стиле 1Т PWA.
 */
export function Card({
  title,
  children,
  className = '',
  accent = 'cyan',
  collapsible = true,
  defaultCollapsed = false,
  storageKey,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  accent?: 'cyan' | 'pink';
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  storageKey?: string;
}) {
  const titleId = useId();
  const actionId = useId();
  const contentId = useId();
  const sectionKey = storageKey ?? title;
  const canCollapse = collapsible && !!title;
  const [collapsed, setCollapsed] = useState(() =>
    readStoredCollapsed(sectionKey, defaultCollapsed),
  );
  const expanded = !collapsed;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeStoredCollapsed(sectionKey, next);
      return next;
    });
  };

  return (
    <section
      className={`sim-card ${accent === 'pink' ? 'sim-card--pink' : ''} ${
        canCollapse ? 'sim-card--collapsible' : ''
      } ${collapsed ? 'sim-card--collapsed' : ''} ${className}`}
    >
      {title ? (
        <div className="sim-card__header">
          <h3 id={titleId} className="sim-card__title">
            {title}
          </h3>
          {canCollapse ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={expanded}
              aria-controls={contentId}
              aria-labelledby={`${actionId} ${titleId}`}
              title={`${expanded ? 'Свернуть' : 'Развернуть'} ${title}`}
              className="sim-card__toggle"
            >
              <span id={actionId} className="sr-only">
                {expanded ? 'Свернуть' : 'Развернуть'}
              </span>
              <span className="sim-card__chevron" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div id={contentId} className="sim-card__body" hidden={canCollapse && collapsed}>
        {children}
      </div>
    </section>
  );
}

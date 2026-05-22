import { type ReactNode, useId, useState } from 'react';

/**
 * Простые табы с keep-mounted содержимым: все панели рендерятся,
 * неактивные скрываются через display:none. Это нужно, чтобы uPlot-инстансы
 * и состояние графиков не пересоздавались при переключении вкладок.
 */
export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  const groupId = useId();
  const [visited, setVisited] = useState<Set<string>>(() => new Set([active]));

  const visitAndChange = (id: string) => {
    setVisited((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    onChange(id);
  };

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Вкладки панели" className="sim-tablist">
        {tabs.map((t, index) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${groupId}-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`${groupId}-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => visitAndChange(t.id)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const last = tabs.length - 1;
                const nextIndex =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? last
                      : event.key === 'ArrowRight'
                        ? (index + 1) % tabs.length
                        : (index - 1 + tabs.length) % tabs.length;
                const next = tabs[nextIndex];
                if (!next) return;
                visitAndChange(next.id);
                window.requestAnimationFrame(() => {
                  document.getElementById(`${groupId}-tab-${next.id}`)?.focus();
                });
              }}
              className={`sim-tab flex-1 px-3 ${isActive ? 'sim-tab--active' : ''}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        {tabs.map((t) => {
          const isActive = t.id === active;
          const wasVisited = isActive || visited.has(t.id);
          return (
            <div
              key={t.id}
              role="tabpanel"
              id={`${groupId}-panel-${t.id}`}
              aria-labelledby={`${groupId}-tab-${t.id}`}
              hidden={!isActive}
              style={{ display: isActive ? 'flex' : 'none' }}
              className="flex-col gap-2"
            >
              {wasVisited ? t.content : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

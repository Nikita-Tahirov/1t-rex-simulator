import { useEffect, useState } from 'react';

/**
 * Виртуальная клавиатура управления роботом. Работает мышью (desktop) и
 * пальцем (mobile/tablet) через Pointer Events API. Кнопки эмулируют реальные
 * клавиши через `dispatchEvent(KeyboardEvent)` → потребители (`useKeyboard`)
 * не знают о существовании панели, единый input-path.
 *
 * Подсветка нажатой кнопки слушает window keydown/keyup и работает как от
 * физической клавиатуры, так и от synthetic-событий собственных кнопок.
 */

interface KeyBinding {
  code: string;
  label: string;
  tooltip: string;
}

const KEYS: readonly KeyBinding[] = [
  { code: 'KeyW', label: 'W', tooltip: 'Вперёд' },
  { code: 'KeyA', label: 'A', tooltip: 'Поворот налево' },
  { code: 'KeyS', label: 'S', tooltip: 'Назад' },
  { code: 'KeyD', label: 'D', tooltip: 'Поворот направо' },
  { code: 'ArrowUp', label: '↑Up', tooltip: 'Вперёд' },
  { code: 'ArrowLeft', label: '←Left', tooltip: 'Поворот налево' },
  { code: 'ArrowDown', label: '↓Down', tooltip: 'Назад' },
  { code: 'ArrowRight', label: '→Right', tooltip: 'Поворот направо' },
  { code: 'Space', label: 'Space', tooltip: 'Тормоз' },
  { code: 'KeyR', label: 'R', tooltip: 'Ротор быстрее' },
  { code: 'KeyF', label: 'F', tooltip: 'Ротор медленнее' },
  { code: 'KeyX', label: 'X', tooltip: 'Сброс позиции' },
] as const;

const TRACKED_CODES = new Set(KEYS.map((k) => k.code));

function dispatchKey(code: string, type: 'keydown' | 'keyup'): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

export function OnScreenControls() {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!TRACKED_CODES.has(e.code)) return;
      setKeys((prev) => {
        if (prev.has(e.code)) return prev;
        const next = new Set(prev);
        next.add(e.code);
        return next;
      });
    };
    const onUp = (e: KeyboardEvent) => {
      if (!TRACKED_CODES.has(e.code)) return;
      setKeys((prev) => {
        if (!prev.has(e.code)) return prev;
        const next = new Set(prev);
        next.delete(e.code);
        return next;
      });
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, code: string) => {
    // preventDefault блокирует mouse-emulated click + контекстное меню на long-press.
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dispatchKey(code, 'keydown');
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>, code: string) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dispatchKey(code, 'keyup');
  };

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setIsCollapsed(false)}
        aria-label="Показать панель управления"
        className="sim-control pointer-events-auto absolute top-4 left-4 z-10 px-3 sm:top-auto sm:bottom-4"
      >
        ⌨ Управление
      </button>
    );
  }

  return (
    <div className="sim-floating-readout pointer-events-auto absolute top-4 left-4 z-10 select-none px-3 py-3 font-mono text-xs text-[var(--color-text-dim)] sm:top-auto sm:bottom-4">
      <button
        type="button"
        onClick={() => setIsCollapsed(true)}
        aria-label="Скрыть панель управления"
        className="absolute -top-2.5 -right-2.5 z-20 grid h-7 w-7 place-items-center rounded-full border border-[var(--surface-border)] bg-[var(--surface-raised-bg)] text-base leading-none text-[var(--text-secondary)] shadow-[var(--surface-shadow-raised)] transition-all hover:scale-110 hover:border-[var(--color-accent-pink)] hover:text-[var(--color-accent-pink)]"
      >
        ×
      </button>
      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map(({ code, label, tooltip }) => {
          const pressed = keys.has(code);
          return (
            <button
              key={code}
              type="button"
              aria-label={`${label} — ${tooltip}`}
              aria-pressed={pressed}
              onPointerDown={(e) => handlePointerDown(e, code)}
              onPointerUp={(e) => handlePointerUp(e, code)}
              onPointerCancel={(e) => handlePointerUp(e, code)}
              onContextMenu={(e) => e.preventDefault()}
              className={`group relative inline-flex min-h-11 min-w-11 touch-none items-center justify-center rounded-lg px-2 py-1 transition-colors ${
                pressed
                  ? 'bg-accent-pink/30 text-[var(--color-text)]'
                  : 'border border-[var(--surface-border)] hover:border-[var(--color-accent-pink)]'
              }`}
            >
              <span>{label}</span>
              <span
                role="tooltip"
                className="pointer-events-none absolute -top-7 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity sm:block sm:group-hover:opacity-100"
              >
                {tooltip}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

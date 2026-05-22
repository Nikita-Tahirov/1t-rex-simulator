import { lazy, Suspense, useState } from 'react';
import { Card } from '@/hud/components/Card.tsx';
import { ScenarioPanel } from '@/hud/components/ScenarioPanel.tsx';
import { type TabDef, Tabs } from '@/hud/components/Tabs.tsx';
import { FlightTab } from '@/hud/tabs/FlightTab.tsx';
import { useScenarioStore } from '@/store/scenario-store.ts';
import { useSimStore } from '@/store/sim-store.ts';

// Полётная вкладка нужна сразу (активна по умолчанию), её ¬lazy.
// Остальные вкладки тяжёлые (uPlot ~50КБ, MiniMap canvas-логика) → load on demand.
const SensorsTab = lazy(() =>
  import('@/hud/tabs/SensorsTab.tsx').then((m) => ({ default: m.SensorsTab })),
);
const EngineeringTab = lazy(() =>
  import('@/hud/tabs/EngineeringTab.tsx').then((m) => ({ default: m.EngineeringTab })),
);

const TabFallback = () => (
  <div className="px-2 py-3 text-xs text-[var(--color-text-dim)]">Загрузка модуля…</div>
);

/**
 * Главная панель индикации. Три вкладки (Полётная / Сенсоры / Инженерная).
 * Тяжёлые вкладки монтируются при первом открытии и потом сохраняют состояние,
 * чтобы uPlot-графики не пересоздавались при повторном переключении.
 */
export function HudPanel() {
  const [active, setActive] = useState<'flight' | 'sensors' | 'engineer'>('flight');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const cameraMode = useSimStore((s) => s.cameraMode);
  const setCameraMode = useSimStore((s) => s.setCameraMode);
  const paused = useSimStore((s) => s.paused);
  const togglePaused = useSimStore((s) => s.togglePaused);
  const mode = useSimStore((s) => s.mode);
  const setMode = useSimStore((s) => s.setMode);
  const setCommandSource = useScenarioStore((s) => s.setCommandSource);
  const showRealModel = useSimStore((s) => s.showRealModel);
  const showLidar = useSimStore((s) => s.showLidar);
  const toggleRealModel = useSimStore((s) => s.toggleRealModel);
  const toggleLidar = useSimStore((s) => s.toggleLidar);

  const tabs: TabDef[] = [
    { id: 'flight', label: 'Полётная', content: <FlightTab /> },
    {
      id: 'sensors',
      label: 'Сенсоры',
      content: (
        <Suspense fallback={<TabFallback />}>
          <SensorsTab />
        </Suspense>
      ),
    },
    {
      id: 'engineer',
      label: 'Инженерная',
      content: (
        <Suspense fallback={<TabFallback />}>
          <EngineeringTab />
        </Suspense>
      ),
    },
  ];

  const controlModeLabels = {
    manual: 'Ручной',
    fsm: 'FSM',
    bt: 'BT',
  } as const;

  const cameraModeLabels = {
    orbit: 'Орбита',
    follow: 'Следом',
    shoulder: 'Спина',
    'top-down': 'Сверху',
  } as const;

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setIsCollapsed(false)}
        aria-label="Показать правую панель"
        className="sim-control sim-control--active pointer-events-auto fixed right-3 bottom-3 z-50 px-4 sm:absolute sm:top-4 sm:right-4 sm:bottom-auto"
      >
        Показать панель
      </button>
    );
  }

  return (
    <aside className="sim-panel pointer-events-auto fixed inset-x-2 bottom-2 z-50 flex max-h-[62dvh] w-auto select-none flex-col gap-3 overflow-y-auto p-4 sm:absolute sm:inset-auto sm:top-4 sm:right-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[390px]">
      <h2 className="sr-only">1T-REX Sim — панель индикации</h2>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={togglePaused}
          aria-label={paused ? 'Продолжить симуляцию' : 'Поставить симуляцию на паузу'}
          aria-pressed={paused}
          className="grid h-7 w-7 place-items-center rounded-full border border-[var(--surface-border)] bg-[var(--surface-raised-bg)] text-[var(--text-secondary)] shadow-[var(--surface-shadow-raised)] transition-all hover:scale-110 hover:border-[var(--color-accent-pink)] hover:text-[var(--color-accent-pink)]"
        >
          {paused ? (
            <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className="h-3 w-3">
              <path d="M3.5 2l6 4-6 4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className="h-3 w-3">
              <rect x="2.5" y="2" width="2.5" height="8" rx="0.5" />
              <rect x="7" y="2" width="2.5" height="8" rx="0.5" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          aria-label="Скрыть правую панель"
          className="grid h-7 w-7 place-items-center rounded-full border border-[var(--surface-border)] bg-[var(--surface-raised-bg)] text-base leading-none text-[var(--text-secondary)] shadow-[var(--surface-shadow-raised)] transition-all hover:scale-110 hover:border-[var(--color-accent-pink)] hover:text-[var(--color-accent-pink)]"
        >
          ×
        </button>
      </div>

      <Card title="Режим" storageKey="control-mode" className="sim-card--compact">
        <div className="grid grid-cols-3 gap-1.5">
          {(['manual', 'fsm', 'bt'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                if (m === 'manual') setCommandSource('keyboard');
              }}
              aria-pressed={mode === m}
              aria-label={`Режим управления: ${controlModeLabels[m]}`}
              className={`sim-control sim-control--primary flex-1 px-3 ${
                mode === m ? 'sim-control--active' : ''
              }`}
            >
              {controlModeLabels[m]}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Камера" storageKey="camera-mode" className="sim-card--compact">
        <div className="grid grid-cols-4 gap-1.5">
          {(['orbit', 'follow', 'shoulder', 'top-down'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setCameraMode(m)}
              aria-pressed={cameraMode === m}
              aria-label={`Режим камеры: ${cameraModeLabels[m]}`}
              className={`sim-control flex-1 px-3 ${cameraMode === m ? 'sim-control--active' : ''}`}
            >
              {cameraModeLabels[m]}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Вид" storageKey="view-mode" className="sim-card--compact">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={toggleRealModel}
            aria-pressed={showRealModel}
            aria-label={
              showRealModel ? 'Показать простую модель робота' : 'Показать GLB-модель робота'
            }
            className={`sim-control flex-1 px-3 ${showRealModel ? 'sim-control--active' : ''}`}
          >
            Модель
          </button>
          <button
            type="button"
            onClick={toggleLidar}
            aria-pressed={showLidar}
            aria-label={showLidar ? 'Скрыть лучи лидара' : 'Показать лучи лидара'}
            className={`sim-control flex-1 px-3 ${showLidar ? 'sim-control--active' : ''}`}
          >
            Лидар
          </button>
        </div>
      </Card>

      <ScenarioPanel />

      <Tabs tabs={tabs} active={active} onChange={(id) => setActive(id as typeof active)} />
    </aside>
  );
}

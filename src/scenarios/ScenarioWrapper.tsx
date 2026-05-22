import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { useScenarioStore } from '@/store/scenario-store.ts';
import { getScenario, ScenarioEventBus, ScenarioRunner, type SetupContext } from './manager.ts';

declare global {
  interface Window {
    /** Текущий ScenarioRunner — для e2e/dev-консоли. Доступ только для отладки и тестов. */
    __scenarioRunner?: {
      current: ScenarioRunner | null;
      /**
       * Прокручивает физический шаг dt = 1/60 в течение totalSec симуляционного
       * времени без ожидания реального времени. Используется e2e-тестами для проверки
       * summary без 60-секундного прогона. НЕ для релизного использования.
       */
      fastForward: (totalSec: number, stepSec?: number) => void;
    };
  }
}

/**
 * Рендерит спавн-объекты выбранного сценария + крутит ScenarioRunner.tick(dt) каждый
 * physics-кадр.
 *
 * Шина событий (`ScenarioEventBus`) создаётся РАНЬШЕ runner-а через useMemo,
 * чтобы коллайдеры успели подписаться к ней до старта симуляции.
 *
 * Использование: внутри `<Physics>` рядом с `<Robot/>`:
 *   <ScenarioWrapper scenarioId={currentScenarioId} />
 */

interface Props {
  scenarioId: string;
}

export function ScenarioWrapper({ scenarioId }: Props) {
  const scenario = useMemo(() => getScenario(scenarioId), [scenarioId]);
  const busState = useMemo(() => ({ scenarioId, bus: new ScenarioEventBus() }), [scenarioId]);
  const bus = busState.bus;
  const runnerRef = useRef<ScenarioRunner | null>(null);
  const status = useScenarioStore((s) => s.status);
  const seed = useScenarioStore((s) => s.seed);
  const runId = useScenarioStore((s) => s.runId);

  // Пере-создаём runner при смене сценария, переиспользуя текущую шину.
  useEffect(() => {
    if (!scenario) {
      runnerRef.current = null;
      if (typeof window !== 'undefined' && window.__scenarioRunner) {
        window.__scenarioRunner.current = null;
      }
      return;
    }
    runnerRef.current = new ScenarioRunner(scenario, bus, seed);
    // Экспонируем runner в window для e2e/dev-консоли.
    if (typeof window !== 'undefined') {
      const fastForward = (totalSec: number, stepSec = 1 / 60): void => {
        const r = runnerRef.current;
        if (!r) return;
        const steps = Math.max(1, Math.floor(totalSec / stepSec));
        for (let i = 0; i < steps; i++) {
          if (!r.isRunning()) break;
          r.tick(stepSec);
        }
      };
      window.__scenarioRunner = { current: runnerRef.current, fastForward };
    }

    // Агент/CI может почти одновременно сменить scenarioId и запросить `running`.
    // Если React ещё не пересоздал runner, старый экземпляр способен стартовать
    // против нового выбора панели. Поэтому свежий runner запускается здесь.
    if (useScenarioStore.getState().status === 'running') {
      runnerRef.current.start();
    }
  }, [scenario, bus, seed]);

  // При переходе store.status → 'running' стартуем runner.
  useEffect(() => {
    const r = runnerRef.current;
    if (!r) return;
    if (status === 'running' && !r.isRunning()) {
      r.start();
    } else if (status === 'idle' && r.isRunning()) {
      r.stop();
    }
  }, [status]);

  useFrame((_state, delta) => {
    const r = runnerRef.current;
    if (!r) return;
    if (status !== 'running') return;
    // Кэп dt, чтобы лаг не ломал метрику.
    r.tick(Math.min(delta, 0.1));
  });

  if (!scenario) return null;

  const ctx: SetupContext = { bus, seed };
  return <group key={`${scenario.id}-${runId}-${seed}`}>{scenario.setup(ctx)}</group>;
}

import { useId } from 'react';
import { SCENARIO_GROUPS, SCENARIO_LIST } from '@/scenarios/manager.ts';
import { useScenarioStore } from '@/store/scenario-store.ts';
import { Card } from './Card.tsx';

/**
 * Секция выбора сценария, кнопок старт/сброс и просмотра текущей метрики.
 *
 * Самодостаточный компонент — монтируется в боковую панель (см. HudPanel.tsx),
 * не зависит от других виджетов кокпита.
 *
 * Сценарии сгруппированы через `<optgroup>`:
 *   • Базовые миссии — figureEight, obstacleAvoidance, searchAndStrike, spinnerImpact
 *   • Сравнительные эксперименты — Маджвик vs Комплементарный, FSM vs BT, brownout
 */
export function ScenarioPanel() {
  const selectId = useId();
  const currentScenarioId = useScenarioStore((s) => s.currentScenarioId);
  const status = useScenarioStore((s) => s.status);
  const elapsedSec = useScenarioStore((s) => s.elapsedSec);
  const metricValue = useScenarioStore((s) => s.metricValue);
  const message = useScenarioStore((s) => s.message);
  const summary = useScenarioStore((s) => s.summary);
  const verification = useScenarioStore((s) => s.verification);
  const setCurrentScenarioId = useScenarioStore((s) => s.setCurrentScenarioId);
  const setStatus = useScenarioStore((s) => s.setStatus);
  const setElapsed = useScenarioStore((s) => s.setElapsed);
  const setMetricValue = useScenarioStore((s) => s.setMetricValue);
  const setMessage = useScenarioStore((s) => s.setMessage);
  const setSummary = useScenarioStore((s) => s.setSummary);
  const setVerification = useScenarioStore((s) => s.setVerification);
  const clearPilotInput = useScenarioStore((s) => s.clearPilotInput);
  const resetLog = useScenarioStore((s) => s.resetLog);
  const downloadLog = useScenarioStore((s) => s.downloadLog);

  const isRunning = status === 'running';
  const current = SCENARIO_LIST.find((s) => s.id === currentScenarioId);
  const summaryEntries = Object.entries(summary);

  const handleStart = (): void => {
    if (!isRunning) setStatus('running');
  };
  const handleReset = (): void => {
    setStatus('idle');
    setElapsed(0);
    setMetricValue(0);
    setMessage('');
    setSummary({});
    setVerification(null);
    clearPilotInput();
    resetLog();
  };

  return (
    <Card title="Миссия">
      <div className="flex flex-col gap-3 text-xs">
        <label htmlFor={selectId} className="sr-only">
          Сценарий миссии
        </label>
        <select
          id={selectId}
          name="scenario"
          value={currentScenarioId}
          onChange={(e) => {
            if (!isRunning) setCurrentScenarioId(e.target.value);
          }}
          disabled={isRunning}
          className="sim-select disabled:opacity-50"
        >
          {SCENARIO_GROUPS.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {current ? (
          <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">
            {current.description}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums">
          <span className="text-[var(--color-text-dim)]">Статус</span>
          <span className="text-right">
            <StatusBadge status={status} />
          </span>
          <span className="text-[var(--color-text-dim)]">Время</span>
          <span className="text-right">
            {elapsedSec.toFixed(1)} / {current?.timeoutSec ?? 0} с
          </span>
          <span className="text-[var(--color-text-dim)]">Метрика</span>
          <span className="text-right">{metricValue.toFixed(2)}</span>
          <span className="text-[var(--color-text-dim)]">Автономия</span>
          <span className="text-right">{current?.isAutonomyAllowed ? 'разрешена' : 'нет'}</span>
        </div>

        {summaryEntries.length > 0 ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2">
            <p className="mb-1 text-[11px] font-semibold text-[var(--color-text-dim)]">
              Итог эксперимента
            </p>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px]">
              {summaryEntries.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="truncate text-[var(--color-text-dim)]">{k}</dt>
                  <dd className="text-right text-[var(--color-text)]">
                    {Number.isFinite(v) ? v.toFixed(3) : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {verification ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px]">
              <span className="text-[var(--color-text-dim)]">Проверка поведения</span>
              <span
                className={
                  verification.passed ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]'
                }
              >
                {verification.passed ? 'pass' : 'fail'} {Math.round(verification.score * 100)}%
              </span>
            </div>
            {!verification.passed ? (
              <ul className="space-y-0.5 font-mono text-[10px] text-[var(--color-text-dim)]">
                {verification.checks
                  .filter((check) => !check.passed)
                  .slice(0, 3)
                  .map((check) => (
                    <li key={check.id} className="truncate">
                      {check.id}: {check.actual}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {message ? (
          <p className="rounded-xl bg-[rgba(255,255,255,0.05)] px-3 py-2 text-xs text-[var(--color-text)]">
            {message}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={handleStart}
            disabled={isRunning}
            aria-label="Запустить выбранную миссию"
            className="sim-control sim-control--active px-2 disabled:opacity-40"
          >
            Старт
          </button>
          <button
            type="button"
            onClick={handleReset}
            aria-label="Сбросить текущую миссию"
            className="sim-control px-2"
          >
            Сброс
          </button>
          <button
            type="button"
            onClick={() => downloadLog()}
            aria-label="Скачать JSON-лог миссии"
            className="sim-control px-2"
          >
            Скачать лог
          </button>
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label =
    status === 'running'
      ? 'идёт'
      : status === 'completed'
        ? 'завершена'
        : status === 'failed'
          ? 'ошибка'
          : 'ожидание';
  const color =
    status === 'running'
      ? 'var(--color-accent)'
      : status === 'completed'
        ? 'var(--color-accent)'
        : status === 'failed'
          ? 'var(--color-danger)'
          : 'var(--color-text-dim)';
  return (
    <span style={{ color }} className="font-semibold uppercase">
      {label}
    </span>
  );
}

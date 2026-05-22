import { useMemo } from 'react';
import type uPlot from 'uplot';
import { Card } from '@/hud/components/Card.tsx';
import { ChartLegend, type ChartLegendItem } from '@/hud/components/ChartLegend.tsx';
import { Slider } from '@/hud/components/Slider.tsx';
import { UPlotChart } from '@/hud/components/UPlotChart.tsx';
import { createRafSampler } from '@/lib/createRafSampler.ts';
import { useSimStore } from '@/store/sim-store.ts';
import { telemetry } from '@/store/telemetry.ts';
import { useTelemetryFrame } from '@/store/useTelemetryFrame.ts';
import { SIM_COLORS } from '@/theme/tokens.ts';

// uPlot не резолвит CSS-переменные внутри <canvas>; используем hex из tokens.
const CHART_AXIS_STROKE = SIM_COLORS.textDim;
const CHART_GRID_STROKE = SIM_COLORS.panelBorder;

const WINDOW_SECONDS = 5;
const SAMPLE_HZ = 30;
const BUFFER_LEN = WINDOW_SECONDS * SAMPLE_HZ;

const ENGINEERING_SERIES: ReadonlyArray<ChartLegendItem & { readonly width: number }> = [
  { label: 'цель ω', color: SIM_COLORS.accentPink, width: 1.5 },
  { label: 'факт ω', color: SIM_COLORS.accentCyan, width: 1.5 },
];

export function EngineeringTab() {
  const tFrame = useTelemetryFrame();
  const drivePid = useSimStore((s) => s.drivePid);
  const spinnerPid = useSimStore((s) => s.spinnerPid);
  const spinnerTargetRpm = useSimStore((s) => s.spinnerTargetRpm);
  const setDrivePid = useSimStore((s) => s.setDrivePid);
  const setSpinnerPid = useSimStore((s) => s.setSpinnerPid);
  const setSpinnerTargetRpm = useSimStore((s) => s.setSpinnerTargetRpm);

  const data = useEngineeringChartData();

  const options = useMemo<uPlot.Options>(
    () => ({
      width: 320,
      height: 140,
      cursor: { show: false },
      legend: { show: false },
      scales: { x: { time: false } },
      axes: [
        {
          stroke: CHART_AXIS_STROKE,
          grid: { stroke: CHART_GRID_STROKE, width: 0.5 },
          ticks: { stroke: CHART_GRID_STROKE },
        },
        {
          stroke: CHART_AXIS_STROKE,
          grid: { stroke: CHART_GRID_STROKE, width: 0.5 },
          ticks: { stroke: CHART_GRID_STROKE },
        },
      ],
      series: [
        {},
        ...ENGINEERING_SERIES.map((s) => ({ label: s.label, stroke: s.color, width: s.width })),
      ],
    }),
    [],
  );

  return (
    <>
      <Card title="PID привода">
        <div className="flex flex-col gap-2">
          <Slider
            label="kp"
            value={drivePid.kp}
            min={0}
            max={3}
            step={0.01}
            onChange={(v) => setDrivePid({ kp: v })}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="ki"
            value={drivePid.ki}
            min={0}
            max={3}
            step={0.01}
            onChange={(v) => setDrivePid({ ki: v })}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="kd"
            value={drivePid.kd}
            min={0}
            max={3}
            step={0.01}
            onChange={(v) => setDrivePid({ kd: v })}
            format={(v) => v.toFixed(2)}
          />
          <p className="font-mono text-[10px] leading-snug text-[var(--color-text-dim)]">
            эффект виден только при ненулевом газе: нажми W/S или запусти сценарий
          </p>
        </div>
      </Card>

      <Card title="PID ротора">
        <div className="flex flex-col gap-2">
          <Slider
            label="kp"
            value={spinnerPid.kp}
            min={0}
            max={3}
            step={0.01}
            onChange={(v) => setSpinnerPid({ kp: v })}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="ki"
            value={spinnerPid.ki}
            min={0}
            max={3}
            step={0.01}
            onChange={(v) => setSpinnerPid({ ki: v })}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="kd"
            value={spinnerPid.kd}
            min={0}
            max={3}
            step={0.01}
            onChange={(v) => setSpinnerPid({ kd: v })}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="цель ротора"
            value={spinnerTargetRpm}
            min={0}
            max={7000}
            step={50}
            onChange={(v) => setSpinnerTargetRpm(v)}
            format={(v) => v.toFixed(0)}
            unit="об/мин"
          />
          <p className="font-mono text-[10px] leading-snug text-[var(--color-text-dim)]">
            подвинь «цель ротора» вверх, чтобы PID начал крутить диск
          </p>
        </div>
      </Card>

      <Card title="Осциллограмма ω₀ (ПЛ)">
        <div className="flex flex-col gap-2">
          <UPlotChart data={data} options={options} className="h-36 w-full" />
          <ChartLegend items={ENGINEERING_SERIES} />
        </div>
      </Card>

      <Card title="События FSM">
        <p className="font-mono text-[11px] text-[var(--color-text)]">
          последнее:{' '}
          <span className="text-[var(--color-accent-cyan)]">{tFrame.fsmLastTransition || '—'}</span>
        </p>
      </Card>
    </>
  );
}

const engineeringChartStore = createRafSampler<uPlot.AlignedData>({
  sampleHz: SAMPLE_HZ,
  getInitialSnapshot: createInitialData,
  sample: (() => {
    // Stable ring buffer + output массивы; см. SensorsTab — тот же приём.
    const target = new Float64Array(BUFFER_LEN);
    const actual = new Float64Array(BUFFER_LEN);
    const ts = new Float64Array(BUFFER_LEN);
    const tsOut = new Float64Array(BUFFER_LEN);
    const tgtOut = new Float64Array(BUFFER_LEN);
    const actOut = new Float64Array(BUFFER_LEN);
    const startMs = performance.now();
    let head = 0;
    let filled = 0;

    return (now: number) => {
      const tNow = (now - startMs) / 1000;
      ts[head] = tNow;
      target[head] = telemetry.wheelOmegaTarget[0];
      actual[head] = telemetry.wheelOmega[0];
      head = (head + 1) % BUFFER_LEN;
      if (filled < BUFFER_LEN) filled++;

      for (let i = 0; i < BUFFER_LEN; i++) {
        const idx = (head + i) % BUFFER_LEN;
        const tVal = ts[idx] ?? 0;
        tsOut[i] =
          tVal === 0 && i < BUFFER_LEN - filled ? tNow - (BUFFER_LEN - i) / SAMPLE_HZ : tVal;
        tgtOut[i] = target[idx] ?? 0;
        actOut[i] = actual[idx] ?? 0;
      }
      return [tsOut, tgtOut, actOut];
    };
  })(),
});

function createInitialData(): uPlot.AlignedData {
  const ts = new Float64Array(BUFFER_LEN);
  const z = new Float64Array(BUFFER_LEN);
  for (let i = 0; i < BUFFER_LEN; i++) {
    ts[i] = -(BUFFER_LEN - 1 - i) / SAMPLE_HZ;
  }
  return [ts, z, new Float64Array(BUFFER_LEN)];
}

function useEngineeringChartData(): uPlot.AlignedData {
  return engineeringChartStore.useStore();
}

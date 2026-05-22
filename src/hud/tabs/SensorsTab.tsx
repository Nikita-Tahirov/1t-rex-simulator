import { useMemo } from 'react';
import type uPlot from 'uplot';
import { Card } from '@/hud/components/Card.tsx';
import { ChartLegend, type ChartLegendItem } from '@/hud/components/ChartLegend.tsx';
import { MiniMap } from '@/hud/components/MiniMap.tsx';
import { UPlotChart } from '@/hud/components/UPlotChart.tsx';
import { createRafSampler } from '@/lib/createRafSampler.ts';
import { telemetry } from '@/store/telemetry.ts';
import { useTelemetryFrame } from '@/store/useTelemetryFrame.ts';
import { SIM_COLORS } from '@/theme/tokens.ts';

// uPlot рисует в <canvas> через ctx.strokeStyle и НЕ резолвит CSS-переменные.
// Использую hex/rgb напрямую из tokens.
const CHART_AXIS_STROKE = SIM_COLORS.textDim;
const CHART_GRID_STROKE = SIM_COLORS.panelBorder;

const WINDOW_SECONDS = 5;
const SAMPLE_HZ = 30;
const BUFFER_LEN = WINDOW_SECONDS * SAMPLE_HZ;

const SENSOR_SERIES: ReadonlyArray<ChartLegendItem & { readonly width: number }> = [
  { label: 'скорость', color: SIM_COLORS.accentCyan, width: 1.5 },
  { label: 'рысканье', color: SIM_COLORS.accentPink, width: 1.5 },
  { label: 'ток АКБ', color: SIM_COLORS.warn, width: 1 },
  { label: 'дальномер', color: SIM_COLORS.accentPurple, width: 1 },
];

interface RingBuffer {
  t: Float64Array;
  speed: Float64Array;
  yawRate: Float64Array;
  battI: Float64Array;
  range: Float64Array;
}

function makeBuffer(): RingBuffer {
  return {
    t: new Float64Array(BUFFER_LEN),
    speed: new Float64Array(BUFFER_LEN),
    yawRate: new Float64Array(BUFFER_LEN),
    battI: new Float64Array(BUFFER_LEN),
    range: new Float64Array(BUFFER_LEN),
  };
}

export function SensorsTab() {
  const tFrame = useTelemetryFrame();
  const data = useSensorsChartData();

  const options = useMemo<uPlot.Options>(
    () => ({
      width: 320,
      height: 160,
      cursor: { show: false },
      legend: { show: false },
      scales: {
        x: { time: false },
      },
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
        ...SENSOR_SERIES.map((s) => ({ label: s.label, stroke: s.color, width: s.width })),
      ],
    }),
    [],
  );

  const rollDeg = (rad: number) => ((rad * 180) / Math.PI).toFixed(2);
  return (
    <>
      <Card title="Сенсоры">
        <div className="flex flex-col gap-2">
          <UPlotChart data={data} options={options} className="h-40 w-full" />
          <ChartLegend items={SENSOR_SERIES} />
        </div>
      </Card>

      <Card title="Карта арены">
        <MiniMap />
      </Card>

      <Card title="Углы: сырые vs фильтр">
        <dl className="grid grid-cols-3 gap-x-2 gap-y-1 font-mono text-[11px] tabular-nums">
          <dt className="text-[var(--color-text-dim)]">Угол</dt>
          <dd className="text-right text-[var(--color-text-dim)]">сырые</dd>
          <dd className="text-right text-[var(--color-text-dim)]">фильтр</dd>
          <dt className="text-[var(--color-text-dim)]">крен</dt>
          <span className="text-right">{rollDeg(tFrame.roll)}°</span>
          <span className="text-right text-[var(--color-accent-cyan)]">
            {rollDeg(tFrame.filteredRoll)}°
          </span>
          <dt className="text-[var(--color-text-dim)]">тангаж</dt>
          <span className="text-right">{rollDeg(tFrame.pitch)}°</span>
          <span className="text-right text-[var(--color-accent-cyan)]">
            {rollDeg(tFrame.filteredPitch)}°
          </span>
          <dt className="text-[var(--color-text-dim)]">курс</dt>
          <span className="text-right">{rollDeg(tFrame.yaw)}°</span>
          <span className="text-right text-[var(--color-accent-cyan)]">
            {rollDeg(tFrame.filteredYaw)}°
          </span>
        </dl>
      </Card>
    </>
  );
}

const sensorsChartStore = createRafSampler<uPlot.AlignedData>({
  sampleHz: SAMPLE_HZ,
  getInitialSnapshot: createInitialData,
  sample: (() => {
    // Ring buffer и output-массивы аллоцируются один раз; sample() переиспользует
    // их между тиками. Возвращается новый tuple-wrapper (5 ссылок ~40 байт),
    // но сами Float64Array стабильны — снимаем ~6 KB GC pressure на тик.
    const buf = makeBuffer();
    const outTs = new Float64Array(BUFFER_LEN);
    const outS0 = new Float64Array(BUFFER_LEN);
    const outS1 = new Float64Array(BUFFER_LEN);
    const outS2 = new Float64Array(BUFFER_LEN);
    const outS3 = new Float64Array(BUFFER_LEN);
    const startMs = performance.now();
    let head = 0;
    let filled = 0;

    return (now: number) => {
      const tNow = (now - startMs) / 1000;
      buf.t[head] = tNow;
      buf.speed[head] = telemetry.speed;
      buf.yawRate[head] = telemetry.yawRate;
      buf.battI[head] = telemetry.batteryCurrent;
      const range = telemetry.rangeMeters;
      buf.range[head] = Number.isFinite(range) ? range : 8;
      head = (head + 1) % BUFFER_LEN;
      if (filled < BUFFER_LEN) filled++;

      for (let i = 0; i < BUFFER_LEN; i++) {
        const idx = (head + i) % BUFFER_LEN;
        const tVal = buf.t[idx] ?? 0;
        outTs[i] =
          tVal === 0 && i < BUFFER_LEN - filled ? tNow - (BUFFER_LEN - i) / SAMPLE_HZ : tVal;
        outS0[i] = buf.speed[idx] ?? 0;
        outS1[i] = buf.yawRate[idx] ?? 0;
        outS2[i] = buf.battI[idx] ?? 0;
        outS3[i] = buf.range[idx] ?? 0;
      }
      return [outTs, outS0, outS1, outS2, outS3];
    };
  })(),
});

function createInitialData(): uPlot.AlignedData {
  const zeros = new Float64Array(BUFFER_LEN);
  const ts = new Float64Array(BUFFER_LEN);
  for (let i = 0; i < BUFFER_LEN; i++) {
    ts[i] = -(BUFFER_LEN - 1 - i) / SAMPLE_HZ;
  }
  return [ts, zeros, zeros, zeros, zeros];
}

function useSensorsChartData(): uPlot.AlignedData {
  return sensorsChartStore.useStore();
}

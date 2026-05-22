import { memo, useMemo } from 'react';

/**
 * Большой SVG-спидометр. Дуга от -135° до +135° (270° сектор).
 * Tики каждые 1 м/с, основной указатель — стрелка.
 *
 * Optimized 2026-05: static-часть (фон-дуга, тики, текст шкалы) рендерится один
 * раз через useMemo. Dynamic-часть (активная дуга, стрелка, цифровое значение)
 * обновляется при каждом изменении `value`. Это снимает ~80% DOM-операций
 * с 30-Hz UI-сэмплера.
 */
const ARC_START_DEG = -135;
const ARC_END_DEG = 135;
const ARC_TOTAL = ARC_END_DEG - ARC_START_DEG;
const CX = 100;
const CY = 100;
const R = 80;

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  // 0° смотрит вверх; угол растёт по часовой
  const rad = degToRad(deg - 90);
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

interface StaticElements {
  readonly background: string;
  readonly ticks: ReadonlyArray<{
    readonly i: number;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly tx: number;
    readonly ty: number;
  }>;
}

function buildStaticElements(max: number): StaticElements {
  const ticks: StaticElements['ticks'] = Array.from({ length: max + 1 }, (_, i) => {
    const deg = ARC_START_DEG + (i / max) * ARC_TOTAL;
    const [x1, y1] = polar(CX, CY, R - 12, deg);
    const [x2, y2] = polar(CX, CY, R + 2, deg);
    const [tx, ty] = polar(CX, CY, R - 24, deg);
    return { i, x1, y1, x2, y2, tx, ty };
  });
  return {
    background: arcPath(CX, CY, R, ARC_START_DEG, ARC_END_DEG),
    ticks,
  };
}

const SpeedometerStatic = memo(function SpeedometerStatic({ max }: { max: number }) {
  const elements = useMemo(() => buildStaticElements(max), [max]);
  return (
    <g>
      <path
        d={elements.background}
        stroke="var(--color-panel-border)"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      {elements.ticks.map((t) => (
        <g key={t.i}>
          <line
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke="var(--color-text-dim)"
            strokeWidth={1.5}
          />
          <text
            x={t.tx}
            y={t.ty}
            fill="var(--color-text-dim)"
            fontSize={9}
            fontFamily="var(--font-mono)"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {t.i}
          </text>
        </g>
      ))}
      <text
        x={CX}
        y={CY + 52}
        fill="var(--color-text-dim)"
        fontSize={9}
        fontFamily="var(--font-mono)"
        textAnchor="middle"
      >
        м/с
      </text>
    </g>
  );
});

export function Speedometer({ value, max = 7 }: { value: number; max?: number }) {
  const clamped = Math.max(0, Math.min(max, value));
  const ratio = clamped / max;
  const needleDeg = ARC_START_DEG + ratio * ARC_TOTAL;
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-label="Спидометр">
      <title>Спидометр</title>
      <SpeedometerStatic max={max} />
      <path
        d={arcPath(CX, CY, R, ARC_START_DEG, needleDeg)}
        stroke="var(--color-accent-cyan)"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      <g transform={`rotate(${needleDeg} ${CX} ${CY})`}>
        <line
          x1={CX}
          y1={CY + 8}
          x2={CX}
          y2={CY - R + 14}
          stroke="var(--color-accent-pink)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r={5} fill="var(--color-accent-pink)" />
      </g>
      <text
        x={CX}
        y={CY + 36}
        fill="var(--color-text)"
        fontSize={20}
        fontFamily="var(--font-mono)"
        textAnchor="middle"
        fontWeight="700"
      >
        {clamped.toFixed(2)}
      </text>
    </svg>
  );
}

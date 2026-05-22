import { memo, useMemo } from 'react';

/**
 * Мини-тахометр на каждое колесо. Двунаправленный: ±maxOmega рад/с,
 * центр шкалы — 0, окраска по знаку.
 *
 * Optimized 2026-05: static-часть (фон-дуга, центральная метка, подпись)
 * рендерится один раз; на UI-tick меняются только активная дуга и числовое
 * значение.
 */
const ARC_START_DEG = -135;
const ARC_END_DEG = 135;
const ARC_TOTAL = ARC_END_DEG - ARC_START_DEG;
const MID_DEG = (ARC_START_DEG + ARC_END_DEG) / 2;
const CX = 50;
const CY = 50;
const R = 36;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arc(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const [x1, y1] = polar(cx, cy, r, Math.min(a1, a2));
  const [x2, y2] = polar(cx, cy, r, Math.max(a1, a2));
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

interface StaticGeometry {
  readonly backgroundPath: string;
  readonly midX1: number;
  readonly midY1: number;
  readonly midX2: number;
  readonly midY2: number;
}

function buildStaticGeometry(): StaticGeometry {
  const [midX1, midY1] = polar(CX, CY, R - 6, MID_DEG);
  const [midX2, midY2] = polar(CX, CY, R + 2, MID_DEG);
  return {
    backgroundPath: arc(CX, CY, R, ARC_START_DEG, ARC_END_DEG),
    midX1,
    midY1,
    midX2,
    midY2,
  };
}

const STATIC_GEOMETRY = buildStaticGeometry();

const TachometerStatic = memo(function TachometerStatic({ label }: { label: string }) {
  return (
    <g>
      <path
        d={STATIC_GEOMETRY.backgroundPath}
        stroke="var(--color-panel-border)"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <line
        x1={STATIC_GEOMETRY.midX1}
        y1={STATIC_GEOMETRY.midY1}
        x2={STATIC_GEOMETRY.midX2}
        y2={STATIC_GEOMETRY.midY2}
        stroke="var(--color-text-dim)"
        strokeWidth={1}
      />
      <text
        x={CX}
        y={CY + 8}
        fill="var(--color-text-dim)"
        fontSize={7}
        fontFamily="var(--font-mono)"
        textAnchor="middle"
      >
        рад/с
      </text>
      <text
        x={CX}
        y={CY + 22}
        fill="var(--color-accent)"
        fontSize={8}
        fontFamily="var(--font-mono)"
        textAnchor="middle"
        fontWeight="700"
      >
        {label}
      </text>
    </g>
  );
});

export function Tachometer({
  value,
  maxOmega = 200,
  label,
}: {
  value: number;
  maxOmega?: number;
  label: string;
}) {
  const clamped = Math.max(-maxOmega, Math.min(maxOmega, value));
  const ratio = clamped / maxOmega; // -1..1
  const targetDeg = MID_DEG + ratio * (ARC_TOTAL / 2);
  const color = ratio >= 0 ? 'var(--color-accent-cyan)' : 'var(--color-accent-pink)';
  const activePath = useMemo(
    () => arc(CX, CY, R, Math.min(MID_DEG, targetDeg), Math.max(MID_DEG, targetDeg)),
    [targetDeg],
  );
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-label={`Тахометр ${label}`}>
      <title>{`Тахометр ${label}`}</title>
      <TachometerStatic label={label} />
      <path d={activePath} stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" />
      <text
        x={CX}
        y={CY - 4}
        fill="var(--color-text)"
        fontSize={11}
        fontFamily="var(--font-mono)"
        textAnchor="middle"
        fontWeight="700"
      >
        {clamped.toFixed(0)}
      </text>
    </svg>
  );
}

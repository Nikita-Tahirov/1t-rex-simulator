import { memo } from 'react';

/**
 * Классический авиа-горизонт: верх — небо, низ — земля.
 * Линия горизонта качается по roll и сдвигается по pitch.
 * Углы — в радианах. 1 рад tangage ≈ ~57° → 60 px смещения горизонта.
 *
 * Optimized 2026-05: статичные элементы (внешнее кольцо, шкала крена,
 * самолётик в центре) рендерятся один раз; pitch-ladder и небо/земля —
 * вместе с roll/pitch (это динамическая часть).
 */
const PITCH_PX_PER_RAD = 60;
const CX = 100;
const CY = 60;
const LADDER_STEPS: ReadonlyArray<number> = [-20, -10, 10, 20];
const BANK_TICKS: ReadonlyArray<number> = [-60, -30, 0, 30, 60];

const BankTicks = memo(function BankTicks() {
  return (
    <>
      {BANK_TICKS.map((deg) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const x1 = CX + 54 * Math.cos(rad);
        const y1 = CY + 54 * Math.sin(rad);
        const x2 = CX + 60 * Math.cos(rad);
        const y2 = CY + 60 * Math.sin(rad);
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--color-text-dim)"
            strokeWidth={1}
          />
        );
      })}
    </>
  );
});

const PlaneMark = memo(function PlaneMark() {
  return (
    <g>
      <line
        x1={CX - 18}
        y1={CY}
        x2={CX - 6}
        y2={CY}
        stroke="var(--color-accent-pink)"
        strokeWidth={2}
      />
      <line
        x1={CX + 6}
        y1={CY}
        x2={CX + 18}
        y2={CY}
        stroke="var(--color-accent-pink)"
        strokeWidth={2}
      />
      <circle cx={CX} cy={CY} r={2} fill="var(--color-accent-pink)" />
    </g>
  );
});

const OuterRing = memo(function OuterRing() {
  return (
    <circle
      cx={CX}
      cy={CY}
      r={54}
      fill="none"
      stroke="var(--color-panel-border)"
      strokeWidth={1.5}
    />
  );
});

export function ArtificialHorizon({ roll, pitch }: { roll: number; pitch: number }) {
  const rollDeg = (roll * 180) / Math.PI;
  const pitchOffset = pitch * PITCH_PX_PER_RAD;
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-label="Авиагоризонт">
      <title>Авиагоризонт</title>
      <defs>
        <clipPath id="ah-clip">
          <circle cx={CX} cy={CY} r={52} />
        </clipPath>
      </defs>
      <OuterRing />
      <g clipPath="url(#ah-clip)">
        <g transform={`rotate(${-rollDeg} ${CX} ${CY})`}>
          <g transform={`translate(0 ${pitchOffset})`}>
            <rect x={CX - 200} y={CY - 240} width={400} height={240} fill="#1a3a5c" />
            <rect x={CX - 200} y={CY} width={400} height={240} fill="#5c3a1a" />
            <line
              x1={CX - 200}
              y1={CY}
              x2={CX + 200}
              y2={CY}
              stroke="var(--color-text)"
              strokeWidth={1.5}
            />
            {LADDER_STEPS.map((deg) => {
              const y = CY - ((deg * Math.PI) / 180) * PITCH_PX_PER_RAD;
              const w = deg % 20 === 0 ? 28 : 16;
              return (
                <g key={deg}>
                  <line
                    x1={CX - w}
                    y1={y}
                    x2={CX + w}
                    y2={y}
                    stroke="var(--color-text)"
                    strokeWidth={1}
                  />
                  <text
                    x={CX - w - 4}
                    y={y + 3}
                    fill="var(--color-text)"
                    fontSize={7}
                    fontFamily="var(--font-mono)"
                    textAnchor="end"
                  >
                    {deg}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </g>
      <g transform={`rotate(${-rollDeg} ${CX} ${CY})`}>
        <polygon
          points={`${CX},${CY - 54} ${CX - 4},${CY - 48} ${CX + 4},${CY - 48}`}
          fill="var(--color-accent)"
        />
      </g>
      <BankTicks />
      <PlaneMark />
      <text
        x={CX}
        y={CY + 64}
        fill="var(--color-text-dim)"
        fontSize={8}
        fontFamily="var(--font-mono)"
        textAnchor="middle"
      >
        крен {rollDeg.toFixed(1)}° · тангаж {((pitch * 180) / Math.PI).toFixed(1)}°
      </text>
    </svg>
  );
}

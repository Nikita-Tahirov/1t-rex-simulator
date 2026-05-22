import { useId } from 'react';

/**
 * Управляемый слайдер с подписью и числовым значением. Стилизован под панель индикации.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = (max - min) / 100,
  onChange,
  format = (v: number) => v.toFixed(3),
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  unit?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-semibold text-[var(--color-text-dim)]">
          {label}
        </label>
        <span className="font-mono text-[11px] text-[var(--color-text)] tabular-nums">
          {format(value)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="sim-range"
      />
    </div>
  );
}

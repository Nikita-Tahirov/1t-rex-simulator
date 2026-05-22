/**
 * Бар АКБ: крупная горизонтальная полоса SOC, ниже — числовые поля
 * (Voload / Voopen / I) и температура с цветной подсветкой по порогам.
 */
export function BatteryGauge({
  soc,
  voltageOpen,
  voltageLoad,
  current,
  temperature,
}: {
  soc: number;
  voltageOpen: number;
  voltageLoad: number;
  current: number;
  temperature: number;
}) {
  const socPct = Math.max(0, Math.min(1, soc));
  const socColor =
    socPct > 0.5
      ? 'var(--color-accent-cyan)'
      : socPct > 0.2
        ? 'var(--color-warn)'
        : 'var(--color-danger)';
  const tempColor =
    temperature < 50
      ? 'var(--color-text)'
      : temperature < 70
        ? 'var(--color-warn)'
        : 'var(--color-danger)';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-[var(--color-text-dim)]">АКБ SOC</span>
        <span className="font-mono text-[11px] text-[var(--color-text)] tabular-nums">
          {(socPct * 100).toFixed(0)}%
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--surface-border)] bg-[rgba(255,255,255,0.05)]">
        <div
          className="h-full transition-[width]"
          style={{ width: `${socPct * 100}%`, background: socColor }}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums">
        <Row label="Vload" value={`${voltageLoad.toFixed(2)} В`} />
        <Row label="Vopen" value={`${voltageOpen.toFixed(2)} В`} />
        <Row label="I" value={`${current.toFixed(2)} А`} />
        <Row label="T°" value={`${temperature.toFixed(1)}°C`} valueColor={tempColor} />
      </dl>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <>
      <dt className="text-[var(--color-text-dim)]">{label}</dt>
      <dd className="text-right" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </dd>
    </>
  );
}

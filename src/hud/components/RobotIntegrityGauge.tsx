import type { RobotDamageSource } from '@/physics/robotDamage.ts';
import { ROBOT_MAX_HEALTH, robotIntegrityBand } from '@/physics/robotDamage.ts';

const SOURCE_LABEL: Record<RobotDamageSource, string> = {
  none: 'нет',
  shredder: 'шредер',
  impact: 'удар',
};

const BAND_LABEL: Record<ReturnType<typeof robotIntegrityBand>, string> = {
  nominal: 'норма',
  worn: 'износ',
  damaged: 'повреждение',
  critical: 'критично',
  disabled: 'отказ',
};

export function RobotIntegrityGauge({
  health,
  damage,
  lastSource,
  lastEnergyJ,
  lastForceN,
}: {
  health: number;
  damage: number;
  lastSource: RobotDamageSource;
  lastEnergyJ: number;
  lastForceN: number;
}) {
  const ratio = Math.max(0, Math.min(1, health / ROBOT_MAX_HEALTH));
  const band = robotIntegrityBand(health);
  const color =
    ratio > 0.55 ? 'var(--color-ok)' : ratio > 0.25 ? 'var(--color-warn)' : 'var(--color-danger)';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-[var(--color-text-dim)]">осталось</span>
        <span className="font-mono text-[11px] text-[var(--color-text)] tabular-nums">
          {health.toFixed(0)} / {ROBOT_MAX_HEALTH}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--surface-border)] bg-[rgba(255,255,255,0.05)]">
        <div
          className="h-full transition-[width]"
          style={{ width: `${ratio * 100}%`, background: color }}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums">
        <Row label="статус" value={BAND_LABEL[band]} valueColor={color} />
        <Row label="накоплено" value={damage.toFixed(0)} />
        <Row label="источник" value={SOURCE_LABEL[lastSource]} />
        <Row label="Eудар" value={`${lastEnergyJ.toFixed(0)} Дж`} />
        <Row label="Fконт" value={`${lastForceN.toFixed(0)} Н`} />
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

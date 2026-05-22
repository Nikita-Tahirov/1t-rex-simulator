import { memo } from 'react';
import { ArtificialHorizon } from '@/hud/components/ArtificialHorizon.tsx';
import { BatteryGauge } from '@/hud/components/BatteryGauge.tsx';
import { Card } from '@/hud/components/Card.tsx';
import { RobotIntegrityGauge } from '@/hud/components/RobotIntegrityGauge.tsx';
import { Speedometer } from '@/hud/components/Speedometer.tsx';
import { Tachometer } from '@/hud/components/Tachometer.tsx';
import { useTelemetryField, useTelemetryTupleAt } from '@/store/useTelemetryFrame.ts';

const WHEEL_LABELS = ['ПЛ', 'ПП', 'ЗЛ', 'ЗП'] as const;
const WHEEL_INDICES: ReadonlyArray<0 | 1 | 2 | 3> = [0, 1, 2, 3];

/**
 * Каждая карточка — отдельный компонент с точечной подпиской на конкретные поля
 * `telemetry`. React ре-рендерит только тот блок, чьё поле действительно
 * изменилось между UI-тикaми (≤30 Hz). Это снимает ~80% реконсилиаций по
 * сравнению с прежним monolithic-FlightTab, который дёргал useTelemetryFrame()
 * целиком.
 */
const SpeedCard = memo(function SpeedCard() {
  const speed = useTelemetryField('speed');
  return (
    <Card title="Скорость">
      <div className="aspect-square w-full">
        <Speedometer value={speed} max={7} />
      </div>
    </Card>
  );
});

const WheelTachometer = memo(function WheelTachometer({
  index,
  label,
}: {
  index: 0 | 1 | 2 | 3;
  label: string;
}) {
  const omega = useTelemetryTupleAt('wheelOmega', index);
  return (
    <div className="aspect-square">
      <Tachometer value={omega} maxOmega={200} label={label} />
    </div>
  );
});

const WheelsCard = memo(function WheelsCard() {
  return (
    <Card title="Колёса (ω)">
      <div className="grid grid-cols-2 gap-1">
        {WHEEL_INDICES.map((i) => (
          <WheelTachometer key={WHEEL_LABELS[i]} index={i} label={WHEEL_LABELS[i]} />
        ))}
      </div>
    </Card>
  );
});

const AttitudeCard = memo(function AttitudeCard() {
  const roll = useTelemetryField('filteredRoll');
  const pitch = useTelemetryField('filteredPitch');
  return (
    <Card title="Ориентация">
      <div className="aspect-[5/3] w-full">
        <ArtificialHorizon roll={roll} pitch={pitch} />
      </div>
    </Card>
  );
});

const BatteryCard = memo(function BatteryCard() {
  const soc = useTelemetryField('batterySoc');
  const voltageOpen = useTelemetryField('batteryVoltageOpen');
  const voltageLoad = useTelemetryField('batteryVoltageLoad');
  const current = useTelemetryField('batteryCurrent');
  const temperature = useTelemetryField('batteryTemperature');
  return (
    <Card title="Питание">
      <BatteryGauge
        soc={soc}
        voltageOpen={voltageOpen}
        voltageLoad={voltageLoad}
        current={current}
        temperature={temperature}
      />
    </Card>
  );
});

const IntegrityCard = memo(function IntegrityCard() {
  const health = useTelemetryField('robotHealth');
  const damage = useTelemetryField('robotDamage');
  const lastSource = useTelemetryField('robotDamageLastSource');
  const lastEnergyJ = useTelemetryField('robotDamageLastEnergyJ');
  const lastForceN = useTelemetryField('robotDamageLastForceN');
  return (
    <Card title="Прочность робота">
      <RobotIntegrityGauge
        health={health}
        damage={damage}
        lastSource={lastSource}
        lastEnergyJ={lastEnergyJ}
        lastForceN={lastForceN}
      />
    </Card>
  );
});

export function FlightTab() {
  return (
    <>
      <SpeedCard />
      <WheelsCard />
      <AttitudeCard />
      <BatteryCard />
      <IntegrityCard />
    </>
  );
}

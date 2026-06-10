import { LocalDynamicRobot, RemoteDynamicProxy } from './BattleRobotDynamic.tsx';
import { LocalKinematicRobot, RemoteKinematicRobot } from './BattleRobotKinematic.tsx';
import type { BattlePhysicsTier, BattleRobotProps } from './battleRobotTypes.ts';

export type { BattleRobotConfig } from './battleRobotTypes.ts';

/**
 * Боевой робот сетевого режима. Диспетчер по уровню физики и роли:
 * - `full` → динамические Rapier-тела ([`BattleRobotDynamic`]): инерция, наезды,
 *   опрокидывание, реальный контакт ротора;
 * - `lite` → лёгкая кинематика ([`BattleRobotKinematic`]) как fallback для слабых
 *   устройств (адаптивная деградация).
 * Локальный робот авторитетен; удалённые — кинематические прокси/призраки.
 */
export function BattleRobot(props: BattleRobotProps & { physicsTier: BattlePhysicsTier }) {
  const { physicsTier, ...rest } = props;
  if (physicsTier === 'lite') {
    return rest.config.isLocal ? (
      <LocalKinematicRobot {...rest} />
    ) : (
      <RemoteKinematicRobot config={rest.config} />
    );
  }
  return rest.config.isLocal ? (
    <LocalDynamicRobot {...rest} />
  ) : (
    <RemoteDynamicProxy config={rest.config} />
  );
}

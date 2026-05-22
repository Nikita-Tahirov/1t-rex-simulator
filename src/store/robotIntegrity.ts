import {
  applyRobotDamageState,
  createRobotDamageState,
  type RobotDamageEvent,
} from '@/physics/robotDamage.ts';
import { telemetry } from './telemetry.ts';

export function resetRobotIntegrity(): void {
  publishRobotIntegrity(createRobotDamageState());
}

export function applyRobotDamage(event: RobotDamageEvent): void {
  if (!Number.isFinite(event.amount) || event.amount <= 0) return;
  publishRobotIntegrity(
    applyRobotDamageState(
      {
        health: telemetry.robotHealth,
        damage: telemetry.robotDamage,
        lastSource: telemetry.robotDamageLastSource,
        lastAtMs: telemetry.robotDamageLastAtMs,
        lastEnergyJ: telemetry.robotDamageLastEnergyJ,
        lastForceN: telemetry.robotDamageLastForceN,
      },
      event,
    ),
  );
}

function publishRobotIntegrity(state: ReturnType<typeof createRobotDamageState>): void {
  telemetry.robotHealth = state.health;
  telemetry.robotDamage = state.damage;
  telemetry.robotDamageLastSource = state.lastSource;
  telemetry.robotDamageLastAtMs = state.lastAtMs;
  telemetry.robotDamageLastEnergyJ = state.lastEnergyJ;
  telemetry.robotDamageLastForceN = state.lastForceN;
  telemetry.arenaDamage = state.damage;
}

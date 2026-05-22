/**
 * @packageDocumentation
 * Слой состояния 1T-REX. Намеренно разнесён по двум технологиям:
 *
 * - **Zustand** (`useSimStore`, `useScenarioStore`) — низкочастотное UI-состояние:
 *   режим управления, выбор камеры, PID-коэффициенты, статус сценария. Обновляется
 *   по действию пользователя или сценарного раннера.
 * - **Valtio** (`telemetry`) — высокочастотная телеметрия 60+ Гц, мутируется in-place
 *   из `useFrame` без аллокаций. Подписчики читают через `useSnapshot` точечно.
 *
 * `robotIntegrity` — fasade поверх `physics/robotDamage`, чтобы HUD и сценарии
 * не зависели от физического слоя напрямую.
 *
 * Scenario log — отдельный буфер модуля (`getScenarioLog()`), не zustand-set
 * каждые 100 мс: O(1) push, не O(N) копирование. Доказательный артефакт ВКР.
 *
 * @see [docs/architecture.md](../../docs/architecture.md) — поток данных за шаг физики.
 */

export { applyRobotDamage, resetRobotIntegrity } from './robotIntegrity.ts';
export type {
  CommandSource,
  PilotInput,
  RobotResetPose,
  RobotResetRequest,
  ScenarioLogEntry,
  ScenarioLogPayload,
  ScenarioState,
  ScenarioStatus,
  ScenarioVerificationCheck,
  ScenarioVerificationResult,
} from './scenario-store.ts';
export { getScenarioLog, useScenarioStore } from './scenario-store.ts';
export type { CameraMode, ControlMode, PIDGains, SimState } from './sim-store.ts';
export { useSimStore } from './sim-store.ts';
export type { RobotTelemetry } from './telemetry.ts';
export { telemetry } from './telemetry.ts';
export {
  readTelemetryFrame,
  useTelemetryField,
  useTelemetryFrame,
  useTelemetryTupleAt,
} from './useTelemetryFrame.ts';

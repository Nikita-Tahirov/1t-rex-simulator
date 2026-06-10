import type { SpawnPose } from './spawnPoints.ts';

/** Конфиг одного боевого робота (общий для kinematic- и dynamic-реализаций). */
export interface BattleRobotConfig {
  uid: string;
  colorIndex: number;
  isLocal: boolean;
  spawn: SpawnPose;
}

export interface BattleRobotProps {
  config: BattleRobotConfig;
  arenaSize: number;
  /** Управление включено (обратный отсчёт завершён). */
  active: boolean;
}

/**
 * Уровень физики боя (адаптивная деградация):
 * - `full` — динамические Rapier-тела (инерция, наезды, опрокидывание, контакт ротора);
 * - `lite` — лёгкая кинематика `battleArcade` (fallback для слабых устройств).
 */
export type BattlePhysicsTier = 'full' | 'lite';

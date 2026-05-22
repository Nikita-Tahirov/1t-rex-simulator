import { ROBOT } from './constants.ts';

/**
 * Высоты, на которых начинаются визуальные эффекты повреждения корпуса.
 * Извлечены из `RobotDamageEffects.tsx`, чтобы соблюсти правило
 * `react-refresh/only-export-components` (компонент-файл может экспортировать
 * только компоненты; константы и чистые функции живут отдельно).
 */

const DAMAGE_EFFECT_DECK_CLEARANCE_M = 0.02;

export const CHASSIS_DECK_DAMAGE_EFFECT_BASE_Y =
  ROBOT.chassisHeight / 2 + DAMAGE_EFFECT_DECK_CLEARANCE_M;
export const REAL_MODEL_DAMAGE_EFFECT_BASE_Y = CHASSIS_DECK_DAMAGE_EFFECT_BASE_Y;
export const PLACEHOLDER_DAMAGE_EFFECT_BASE_Y = CHASSIS_DECK_DAMAGE_EFFECT_BASE_Y;

export function damageEffectBaseY(showRealModel: boolean): number {
  return showRealModel ? REAL_MODEL_DAMAGE_EFFECT_BASE_Y : PLACEHOLDER_DAMAGE_EFFECT_BASE_Y;
}

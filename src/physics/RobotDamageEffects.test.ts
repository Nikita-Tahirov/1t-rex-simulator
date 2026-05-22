import { describe, expect, it } from 'vitest';
import { ROBOT } from './constants.ts';
import {
  CHASSIS_DECK_DAMAGE_EFFECT_BASE_Y,
  damageEffectBaseY,
  PLACEHOLDER_DAMAGE_EFFECT_BASE_Y,
  REAL_MODEL_DAMAGE_EFFECT_BASE_Y,
} from './robotDamageEffectsLayout.ts';

describe('robot damage effects layout', () => {
  it('якорит VFX на верхней палубе физического корпуса', () => {
    expect(CHASSIS_DECK_DAMAGE_EFFECT_BASE_Y).toBeCloseTo(ROBOT.chassisHeight / 2 + 0.02);
    expect(PLACEHOLDER_DAMAGE_EFFECT_BASE_Y).toBe(CHASSIS_DECK_DAMAGE_EFFECT_BASE_Y);
    expect(damageEffectBaseY(false)).toBe(PLACEHOLDER_DAMAGE_EFFECT_BASE_Y);
  });

  it('не цепляет VFX к верхней точке GLB-кронштейнов', () => {
    const measuredRealModelUpperProtrusionY = 0.242;

    expect(REAL_MODEL_DAMAGE_EFFECT_BASE_Y).toBeLessThan(measuredRealModelUpperProtrusionY);
    expect(REAL_MODEL_DAMAGE_EFFECT_BASE_Y).toBe(CHASSIS_DECK_DAMAGE_EFFECT_BASE_Y);
    expect(damageEffectBaseY(true)).toBe(REAL_MODEL_DAMAGE_EFFECT_BASE_Y);
  });
});

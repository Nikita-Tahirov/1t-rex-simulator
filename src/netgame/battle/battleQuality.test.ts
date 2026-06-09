import { describe, expect, it } from 'vitest';
import { dprFromFactor, initialBattleQuality, MIN_BATTLE_DPR } from './battleQuality.ts';

describe('initialBattleQuality', () => {
  it('мобильные и малоядерные — без теней, низкий DPR', () => {
    expect(initialBattleQuality({ mobile: true, cores: 8 })).toMatchObject({
      shadows: false,
      antialias: false,
      maxDpr: 1,
    });
    expect(initialBattleQuality({ mobile: false, cores: 4 }).shadows).toBe(false);
  });

  it('десктоп с многоядерным CPU — тени и DPR до 1.25', () => {
    expect(initialBattleQuality({ mobile: false, cores: 12 })).toMatchObject({
      shadows: true,
      antialias: true,
      maxDpr: 1.25,
    });
  });
});

describe('dprFromFactor', () => {
  it('масштабирует DPR в [MIN, max] по фактору FPS', () => {
    expect(dprFromFactor(1, 1.25)).toBeCloseTo(1.25, 5);
    expect(dprFromFactor(0, 1.25)).toBeCloseTo(MIN_BATTLE_DPR, 5);
    expect(dprFromFactor(0.5, 1)).toBeCloseTo((MIN_BATTLE_DPR + 1) / 2, 2);
  });

  it('клампит фактор за пределами [0,1]', () => {
    expect(dprFromFactor(2, 1.25)).toBeCloseTo(1.25, 5);
    expect(dprFromFactor(-1, 1.25)).toBeCloseTo(MIN_BATTLE_DPR, 5);
  });
});

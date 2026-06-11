import { afterEach, describe, expect, it } from 'vitest';
import {
  addDealtDamage,
  approachSpeed,
  type CombatPose,
  dealMeleeDamage,
  dealtRecord,
  decaySpinnerRpm,
  frontDot,
  incomingDelta,
  RAM_MIN_APPROACH_MPS,
  ramDamage,
  resetDealtDamage,
  SPINNER_ACTIVE_RPM,
  SPINNER_MAX_RPM,
  spinnerDamage,
  stepSpinnerRpm,
} from './battleCombat.ts';
import { passesContactCooldown } from './battleContactDamage.ts';
import { drainHits, type HitEvent, resetHitFeed } from './battleHitFeed.ts';

afterEach(() => {
  resetDealtDamage();
  resetHitFeed();
});

describe('управление спиннером', () => {
  it('R разгоняет до максимума, F тормозит до нуля, иначе держит', () => {
    expect(stepSpinnerRpm(0, true, false, 1)).toBeCloseTo(800, 5);
    expect(stepSpinnerRpm(SPINNER_MAX_RPM, true, false, 1)).toBe(SPINNER_MAX_RPM); // кламп сверху
    expect(stepSpinnerRpm(1000, false, true, 1)).toBeCloseTo(0, 5); // 1000-1500 → 0 (кламп снизу)
    expect(stepSpinnerRpm(3000, false, false, 1)).toBe(3000); // держит
  });

  it('затухание тянет обороты к нулю', () => {
    expect(decaySpinnerRpm(1000, 1)).toBeCloseTo(0, 5);
    expect(decaySpinnerRpm(5000, 1)).toBeCloseTo(3500, 5);
  });
});

describe('approachSpeed (односторонняя скорость сближения атакующего)', () => {
  const target: CombatPose = { x: 2, z: 0, yaw: 0, speed: 0 };

  it('движение НА цель даёт положительную скорость', () => {
    const self: CombatPose = { x: 0, z: 0, yaw: 0, speed: 3 }; // едет в +X на цель
    expect(approachSpeed(self, target)).toBeCloseTo(3, 5);
  });

  it('стоящий робот НЕ сближается (не бьёт сам себя)', () => {
    const self: CombatPose = { x: 0, z: 0, yaw: 0, speed: 0 };
    expect(approachSpeed(self, target)).toBe(0);
  });

  it('движение ОТ цели не считается сближением', () => {
    const self: CombatPose = { x: 0, z: 0, yaw: Math.PI, speed: 3 }; // едет в −X, от цели
    expect(approachSpeed(self, target)).toBe(0);
  });
});

describe('frontDot (фронтальный сектор спиннера)', () => {
  it('цель прямо по носу → ~1, сзади → отрицательно', () => {
    const self: CombatPose = { x: 0, z: 0, yaw: 0, speed: 0 };
    expect(frontDot(self, { x: 2, z: 0 })).toBeCloseTo(1, 5);
    expect(frontDot(self, { x: -2, z: 0 })).toBeCloseTo(-1, 5);
  });
});

describe('урон', () => {
  it('таран ниже порога не наносит урона, выше — положительный', () => {
    expect(ramDamage(RAM_MIN_APPROACH_MPS)).toBe(0);
    expect(ramDamage(6)).toBeGreaterThan(0);
  });

  it('спиннер ниже активных оборотов не бьёт; растёт с оборотами', () => {
    expect(spinnerDamage(SPINNER_ACTIVE_RPM - 1)).toBe(0);
    const mid = spinnerDamage(SPINNER_MAX_RPM / 2);
    const full = spinnerDamage(SPINNER_MAX_RPM);
    expect(mid).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(mid);
  });
});

describe('накопитель нанесённого урона', () => {
  it('копит, округляет и сбрасывается', () => {
    addDealtDamage('victim', 10.4);
    addDealtDamage('victim', 5.2);
    addDealtDamage('other', 3);
    addDealtDamage('zero', 0); // игнор
    expect(dealtRecord()).toEqual({ victim: 16, other: 3 });
    resetDealtDamage();
    expect(dealtRecord()).toEqual({});
  });
});

describe('incomingDelta (применение жертвой по дельте)', () => {
  it('первое наблюдение — только базис, без ретро-урона', () => {
    expect(incomingDelta(120, undefined)).toEqual({ delta: 0, next: 120 });
  });

  it('рост счётчика даёт дельту', () => {
    expect(incomingDelta(150, 120)).toEqual({ delta: 30, next: 150 });
  });

  it('падение счётчика (рестарт матча) — новый базис без урона', () => {
    expect(incomingDelta(20, 300)).toEqual({ delta: 0, next: 20 });
  });
});

describe('dealMeleeDamage (нанесение тарана/спиннера за кадр)', () => {
  it('раскрученный спиннер бьёт врага ПРЯМО ПО НОСУ (проблема 2)', () => {
    const self: CombatPose = { x: 0, z: 0, yaw: 0, speed: 0 }; // стоит, нос в +X
    dealMeleeDamage(
      self,
      [{ x: 1.2, z: 0 }],
      ['enemy'],
      SPINNER_MAX_RPM,
      1000,
      new Map(),
      new Map(),
    );
    expect(dealtRecord().enemy).toBe(Math.round(spinnerDamage(SPINNER_MAX_RPM)));
  });

  it('спиннер НЕ бьёт врага позади (вне фронтального сектора), стоящий не таранит', () => {
    const self: CombatPose = { x: 0, z: 0, yaw: 0, speed: 0 };
    dealMeleeDamage(
      self,
      [{ x: -1.2, z: 0 }],
      ['enemy'],
      SPINNER_MAX_RPM,
      1000,
      new Map(),
      new Map(),
    );
    expect(dealtRecord()).toEqual({});
  });

  it('таран движущегося в упор наносит урон даже без спиннера', () => {
    const self: CombatPose = { x: 0, z: 0, yaw: 0, speed: 6 }; // едет в +X на цель
    dealMeleeDamage(self, [{ x: 1.0, z: 0 }], ['enemy'], 0, 1000, new Map(), new Map());
    expect(dealtRecord().enemy).toBeGreaterThan(0);
  });

  it('кулдаун: два кадра в пределах окна дают один удар', () => {
    const self: CombatPose = { x: 0, z: 0, yaw: 0, speed: 0 };
    const lastSpin = new Map<string, number>();
    dealMeleeDamage(self, [{ x: 1.2, z: 0 }], ['e'], SPINNER_MAX_RPM, 1000, new Map(), lastSpin);
    dealMeleeDamage(self, [{ x: 1.2, z: 0 }], ['e'], SPINNER_MAX_RPM, 1100, new Map(), lastSpin);
    expect(dealtRecord().e).toBe(Math.round(spinnerDamage(SPINNER_MAX_RPM)));
  });
});

describe('общий кулдаун контактного и проксимити-тарана (нет двойного учёта)', () => {
  it('контактный хит блокирует проксимити-таран в окне кулдауна и наоборот', () => {
    const self: CombatPose = { x: 0, z: 0, yaw: 0, speed: 6 }; // едет в упор
    const lastRamAt = new Map<string, number>();
    // Контактный путь зарегистрировал удар (как в onContactForce).
    expect(passesContactCooldown(lastRamAt, 'e', 1000)).toBe(true);
    addDealtDamage('e', 10);
    // Проксимити-таран в том же окне НЕ добавляет второй удар.
    dealMeleeDamage(self, [{ x: 1.0, z: 0 }], ['e'], 0, 1100, lastRamAt, new Map());
    expect(dealtRecord().e).toBe(10);
    // После окна кулдауна таран снова проходит.
    dealMeleeDamage(self, [{ x: 1.0, z: 0 }], ['e'], 0, 1400, lastRamAt, new Map());
    expect(dealtRecord().e).toBeGreaterThan(10);
  });
});

describe('hit-лента индикации попаданий', () => {
  it('addDealtDamage пушит событие dealt с суммой удара', () => {
    addDealtDamage('victim', 26);
    const events: HitEvent[] = [];
    drainHits(events);
    expect(events).toEqual([{ uid: 'victim', amount: 26, kind: 'dealt' }]);
    // Очередь опустошена: повторный дрен возвращает пустой scratch.
    drainHits(events);
    expect(events).toHaveLength(0);
  });
});

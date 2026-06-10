import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHASSIS_BOX_HALF,
  CHASSIS_BOX_X,
  CHASSIS_HALF,
  WEDGE_BACK_X,
  WEDGE_BOTTOM_Y,
  WEDGE_NOSE_TOP_Y,
  WEDGE_NOSE_X,
  WEDGE_TOP_Y,
  wedgeVertices,
} from './battleBodyShared.ts';
import {
  drainKnockback,
  KNOCKBACK_MAX_NS,
  KNOCKBACK_UP_RATIO,
  type KnockbackImpulse,
  knockbackImpulse,
  queueKnockback,
  resetKnockback,
} from './battleKnockback.ts';

describe('wedgeVertices — геометрия переднего клина', () => {
  it('8 вершин, симметричных по Z, в пределах габарита шасси', () => {
    const v = wedgeVertices();
    expect(v).toHaveLength(24);
    for (let i = 0; i < 24; i += 3) {
      expect(Math.abs(v[i + 2] ?? Number.NaN)).toBeCloseTo(CHASSIS_HALF[2], 6);
      expect(v[i] ?? Number.NaN).toBeGreaterThanOrEqual(WEDGE_BACK_X);
      expect(v[i] ?? Number.NaN).toBeLessThanOrEqual(CHASSIS_HALF[0]);
    }
  });

  it('нос ниже стыка (рабочая грань наклонена, угол < 45° — заезд возможен)', () => {
    expect(WEDGE_NOSE_TOP_Y).toBeLessThan(WEDGE_TOP_Y);
    const slope = (WEDGE_TOP_Y - WEDGE_NOSE_TOP_Y) / (WEDGE_NOSE_X - WEDGE_BACK_X);
    expect(Math.atan(slope)).toBeLessThan(Math.PI / 4);
    // носовая кромка тонкая, но не вырожденная (устойчивость convex hull)
    expect(WEDGE_NOSE_TOP_Y - WEDGE_BOTTOM_Y).toBeGreaterThan(0.02);
  });

  it('коробка и клин стыкуются без щели и покрывают полную длину шасси', () => {
    expect(CHASSIS_BOX_X + CHASSIS_BOX_HALF[0]).toBeCloseTo(WEDGE_BACK_X, 6);
    expect(CHASSIS_BOX_X - CHASSIS_BOX_HALF[0]).toBeCloseTo(-CHASSIS_HALF[0], 6);
    expect(WEDGE_NOSE_X).toBeCloseTo(CHASSIS_HALF[0], 6);
  });
});

describe('knockbackImpulse — hit-reaction жертвы', () => {
  const out: KnockbackImpulse = { x: 0, y: 0, z: 0 };

  it('направлен от атакующего, вертикаль = доля KNOCKBACK_UP_RATIO', () => {
    expect(knockbackImpulse(30, 0, 0, 2, 0, out)).toBe(true);
    expect(out.x).toBeGreaterThan(0); // жертва правее атакующего → толкает вправо
    expect(out.z).toBeCloseTo(0, 6);
    const total = Math.hypot(out.x, out.z) + Math.abs(out.y);
    expect(out.y / total).toBeCloseTo(KNOCKBACK_UP_RATIO, 2);
  });

  it('магнитуда ограничена потолком, нулевой урон — false', () => {
    expect(knockbackImpulse(10_000, 0, 0, 1, 0, out)).toBe(true);
    expect(Math.hypot(out.x, out.z) + Math.abs(out.y)).toBeLessThanOrEqual(KNOCKBACK_MAX_NS + 1e-6);
    expect(knockbackImpulse(0, 0, 0, 1, 0, out)).toBe(false);
  });

  it('совпавшие позиции (деление на ~0) — чисто вертикальный подброс', () => {
    expect(knockbackImpulse(20, 1, 1, 1, 1, out)).toBe(true);
    expect(out.x).toBe(0);
    expect(out.z).toBe(0);
    expect(out.y).toBeGreaterThan(0);
  });
});

describe('очередь knockback (сетевой хук → тело локального робота)', () => {
  beforeEach(() => resetKnockback());
  const out: KnockbackImpulse = { x: 0, y: 0, z: 0 };

  it('накапливает несколько ударов за кадр и опустошается за один drain', () => {
    queueKnockback({ x: 10, y: 5, z: 0 });
    queueKnockback({ x: -4, y: 5, z: 2 });
    expect(drainKnockback(out)).toBe(true);
    expect(out).toEqual({ x: 6, y: 10, z: 2 });
    expect(drainKnockback(out)).toBe(false);
  });
});

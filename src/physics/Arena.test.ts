import { describe, expect, it } from 'vitest';
import { computeShredderDamageDelta } from './arena/damage.ts';

describe('shredder damage disk', () => {
  it('наносит урон роботу внутри радиуса горизонтального ротора', () => {
    expect(computeShredderDamageDelta(0.5, 0.2, 0.21, 0.5)).toBeGreaterThan(0);
  });

  it('наносит урон при касании краем корпуса', () => {
    expect(computeShredderDamageDelta(1.45, 0, 0.21, 0.5)).toBeGreaterThan(0);
  });

  it('масштабирует урон по глубине попадания в зону контакта', () => {
    const edge = computeShredderDamageDelta(1.45, 0, 0.21, 0.5);
    const center = computeShredderDamageDelta(0.1, 0.1, 0.21, 0.5);
    expect(center).toBeGreaterThan(edge);
  });

  it('не наносит урон за пределами радиуса ротора и корпуса', () => {
    expect(computeShredderDamageDelta(2.0, 0, 0.21, 0.5)).toBe(0);
  });

  it('не наносит урон объекту выше зоны поражения', () => {
    expect(computeShredderDamageDelta(0.5, 0.2, 0.95, 0.5)).toBe(0);
  });
});

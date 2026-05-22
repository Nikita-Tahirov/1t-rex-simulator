import { ARENA_COLORS, SIM_COLORS } from './tokens.ts';

describe('theme tokens', () => {
  it('keeps simulator colors in tokenized hex/rgba form', () => {
    const tokenValues = Object.values(SIM_COLORS);

    expect(tokenValues.every((value) => /^#(?:[0-9a-f]{6})$|^rgba\(/i.test(value))).toBe(true);
    expect(new Set(tokenValues).size).toBe(tokenValues.length);
  });

  it('keeps every arena zone colorized through data tokens', () => {
    for (const zone of Object.values(ARENA_COLORS)) {
      expect(Object.values(zone).every((value) => /^#[0-9a-f]{6}$/i.test(value))).toBe(true);
    }
  });
});

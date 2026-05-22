// Общие математические утилиты симулятора. Дубли clamp() из 6 файлов
// объединены здесь, чтобы инварианты диапазонов нормировались в одной точке.

export function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

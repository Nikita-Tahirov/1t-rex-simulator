/** Случайная точка в кольце R∈[3, 4]. Стабильный seed на жизнь сценария. */
export function pickTargetPosition(seed: number): { x: number; z: number } {
  const a = (seed * 9301 + 49297) % 233280;
  const angle = (a / 233280) * Math.PI * 2;
  const radius = 3 + ((a >> 3) % 100) / 100;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

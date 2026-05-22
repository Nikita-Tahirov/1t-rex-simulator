let shredderRotorAngleRad = 0;
let shredderRotorAngleOverrideRad: number | null = null;

export function setShredderRotorAngle(angleRad: number): void {
  shredderRotorAngleRad = angleRad;
}

export function getShredderRotorAngle(): number {
  return shredderRotorAngleOverrideRad ?? shredderRotorAngleRad;
}

export function setShredderRotorAngleOverride(angleRad: number | null): void {
  shredderRotorAngleOverrideRad = angleRad;
}

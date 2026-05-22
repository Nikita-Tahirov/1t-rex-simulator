import type { BodyVelocity, WheelSpeeds } from './kinematics.ts';

/**
 * Scratch-структура для hot path `Robot.useFrame`. Все объекты создаются один раз
 * при mount, дальше переиспользуются между тиками — это снимает ~6 аллокаций
 * в физическом кадре (60 Hz) и убирает соответствующее GC pressure.
 */
export interface FrameScratch {
  target: BodyVelocity;
  wheels: WheelSpeeds;
  targetOmega: [number, number, number, number];
  measuredOmega: [number, number, number, number];
  intendedOmega: [number, number, number, number];
  bodyVelocity: BodyVelocity;
}

export function makeFrameScratch(): FrameScratch {
  return {
    target: { linear: 0, angular: 0 },
    wheels: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    targetOmega: [0, 0, 0, 0],
    measuredOmega: [0, 0, 0, 0],
    intendedOmega: [0, 0, 0, 0],
    bodyVelocity: { linear: 0, angular: 0 },
  };
}

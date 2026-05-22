import { describe, expect, it } from 'vitest';
import { SHREDDER_CENTER } from './arena/arenaData.ts';
import { ROBOT } from './constants.ts';
import {
  constrainRobotPlanarMotion,
  SHREDDER_SWEEP_RADIUS,
  shredderCenterDistance,
} from './robotMotionConstraints.ts';

describe('robot planar motion constraints', () => {
  it('не даёт ступице шредера попасть внутрь footprint шасси', () => {
    const result = constrainRobotPlanarMotion({
      currentX: SHREDDER_CENTER[0] - 1.8,
      currentZ: SHREDDER_CENTER[1],
      desiredX: SHREDDER_CENTER[0] - 0.1,
      desiredZ: SHREDDER_CENTER[1],
      yaw: 0,
    });

    expect(result.blockedBy).toBe('shredder');
    expect(shredderCenterDistance(result.x, result.z)).toBeGreaterThanOrEqual(
      SHREDDER_SWEEP_RADIUS + ROBOT.chassisLength / 2 - 1e-6,
    );
  });

  it('оставляет траекторию без изменений вне рабочего радиуса шредера', () => {
    const result = constrainRobotPlanarMotion({
      currentX: 0,
      currentZ: 0,
      desiredX: 0.4,
      desiredZ: 0,
      yaw: 0,
    });

    expect(result).toEqual({ x: 0.4, z: 0, blockedBy: null, penetration: 0, impactSpeedMps: 0 });
  });

  it('учитывает поворот шасси при диагональном контакте с ротором', () => {
    const result = constrainRobotPlanarMotion({
      currentX: SHREDDER_CENTER[0] - 1.8,
      currentZ: SHREDDER_CENTER[1] - 1.8,
      desiredX: SHREDDER_CENTER[0] - 0.2,
      desiredZ: SHREDDER_CENTER[1] - 0.2,
      yaw: Math.PI / 4,
    });

    expect(result.blockedBy).toBe('shredder');
    expect(result.penetration).toBeGreaterThan(0);
  });

  it('пускает корпус в пространство между лопастями вне центральной ступицы', () => {
    const result = constrainRobotPlanarMotion({
      currentX: SHREDDER_CENTER[0],
      currentZ: SHREDDER_CENTER[1] + 2,
      desiredX: SHREDDER_CENTER[0],
      desiredZ: SHREDDER_CENTER[1] + 1.15,
      yaw: -Math.PI / 2,
      rotorAngle: Math.PI / 4,
    });

    expect(result.blockedBy).toBe(null);
    expect(result.z).toBeCloseTo(SHREDDER_CENTER[1] + 1.15);
  });

  it('толкает корпус касательной скоростью текущей лопасти', () => {
    const startX = SHREDDER_CENTER[0] + 0.95;
    const startZ = SHREDDER_CENTER[1] - 0.52;
    const result = constrainRobotPlanarMotion({
      currentX: startX,
      currentZ: startZ,
      desiredX: startX,
      desiredZ: startZ,
      yaw: 0,
      rotorAngle: 0,
      dt: 1 / 60,
    });

    expect(result.blockedBy).toBe('shredder');
    expect(result.penetration).toBeGreaterThan(0);
    expect(result.impactSpeedMps).toBeGreaterThan(0);
    expect(result.z).toBeLessThan(startZ);
  });
});

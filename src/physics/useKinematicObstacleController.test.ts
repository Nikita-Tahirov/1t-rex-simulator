import { QueryFilterFlags, ShapeType } from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { RAMP_COLLISION_GROUPS } from './collisionGroups.ts';
import {
  isBlockingKinematicObstacle,
  isKinematicChassisPoseBlocked,
  KINEMATIC_OBSTACLE_FILTER,
} from './useKinematicObstacleController.ts';

function colliderStub({
  y,
  shapeType,
  halfHeight,
  bodyType = 1,
  collisionGroups = 0xffffffff,
}: {
  y: number;
  shapeType: ShapeType;
  halfHeight?: number;
  bodyType?: number;
  collisionGroups?: number;
}) {
  return {
    parent: () => ({ bodyType: () => bodyType, handle: 42 }),
    shape: { type: shapeType },
    collisionGroups: () => collisionGroups,
    translation: () => ({ x: 0, y, z: 0 }),
    shapeType: () => shapeType,
    halfExtents: () => ({ x: 0.1, y: halfHeight ?? 0.1, z: 0.1 }),
  };
}

describe('kinematic obstacle controller guards', () => {
  it('queries only fixed non-sensor obstacles', () => {
    expect(KINEMATIC_OBSTACLE_FILTER & QueryFilterFlags.ONLY_FIXED).not.toBe(0);
    expect(KINEMATIC_OBSTACLE_FILTER & QueryFilterFlags.EXCLUDE_SENSORS).not.toBe(0);
    expect(KINEMATIC_OBSTACLE_FILTER & QueryFilterFlags.EXCLUDE_DYNAMIC).not.toBe(0);
  });

  it('does not block low floor cuboids', () => {
    expect(
      isBlockingKinematicObstacle(
        colliderStub({ y: 0.05, shapeType: ShapeType.Cuboid, halfHeight: 0.05 }) as never,
      ),
    ).toBe(false);
  });

  it('blocks tall fixed cuboids and non-cuboid obstacles', () => {
    expect(
      isBlockingKinematicObstacle(
        colliderStub({ y: 0.5, shapeType: ShapeType.Cuboid, halfHeight: 0.2 }) as never,
      ),
    ).toBe(true);
    expect(
      isBlockingKinematicObstacle(colliderStub({ y: 0.5, shapeType: ShapeType.Cylinder }) as never),
    ).toBe(true);
  });

  it('does not block dynamic or kinematic robot colliders', () => {
    expect(
      isBlockingKinematicObstacle(
        colliderStub({ y: 0.5, shapeType: ShapeType.Cylinder, bodyType: 0 }) as never,
      ),
    ).toBe(false);
    expect(
      isBlockingKinematicObstacle(
        colliderStub({
          y: 0.5,
          shapeType: ShapeType.Cuboid,
          halfHeight: 0.2,
          bodyType: 2,
        }) as never,
      ),
    ).toBe(false);
  });

  it('does not block ramp colliders excluded by chassis collision groups', () => {
    expect(
      isBlockingKinematicObstacle(
        colliderStub({
          y: 0.3,
          shapeType: ShapeType.ConvexPolyhedron,
          collisionGroups: RAMP_COLLISION_GROUPS,
        }) as never,
      ),
    ).toBe(false);
  });

  it('queries the proposed chassis pose and excludes the robot collider', () => {
    const robotCollider = colliderStub({ y: 0.21, shapeType: ShapeType.Cuboid }) as never;
    const blockingCollider = colliderStub({ y: 0.5, shapeType: ShapeType.Cuboid }) as never;
    const calls: unknown[][] = [];
    const world = {
      intersectionsWithShape: (...args: unknown[]) => {
        calls.push(args);
        const callback = args[3] as (collider: never) => boolean;
        const predicate = args[8] as (collider: never) => boolean;
        if (predicate(blockingCollider)) callback(blockingCollider);
      },
    };

    expect(
      isKinematicChassisPoseBlocked(world as never, robotCollider, {
        position: { x: 1, y: 0.21, z: 0.4 },
        rotation: { x: 0, y: 0.2, z: 0, w: 0.98 },
      }),
    ).toBe(true);
    expect(calls[0]?.[6]).toBe(robotCollider);
    expect(calls[0]?.[7]).toMatchObject({ handle: 42 });
  });
});

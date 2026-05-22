import { QueryFilterFlags, ShapeType } from '@dimforge/rapier3d-compat';
import { type RapierCollider, useRapier } from '@react-three/rapier';
import { useEffect, useRef } from 'react';
import { CHASSIS_COLLISION_GROUPS } from './collisionGroups.ts';

const KINEMATIC_OBSTACLE_OFFSET_M = 0.006;
export const KINEMATIC_OBSTACLE_FILTER =
  QueryFilterFlags.ONLY_FIXED | QueryFilterFlags.EXCLUDE_SENSORS;
const NON_BLOCKING_FLOOR_CENTER_Y_M = 0.12;
const NON_BLOCKING_FLOOR_HALF_HEIGHT_M = 0.085;
const MOVEMENT_CLAMP_EPS = 1e-4;
const FIXED_BODY_TYPE = 1;

interface CorrectedPlanarMove {
  x: number;
  z: number;
  clamped: boolean;
  impactRole: unknown;
}

interface KinematicPose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

interface KinematicShapeQueryWorld {
  intersectionsWithShape(
    position: KinematicPose['position'],
    rotation: KinematicPose['rotation'],
    shape: RapierCollider['shape'],
    callback: (collider: RapierCollider) => boolean,
    filterFlags?: number,
    filterGroups?: number,
    filterExcludeCollider?: RapierCollider,
    filterExcludeRigidBody?: ReturnType<RapierCollider['parent']>,
    filterPredicate?: (collider: RapierCollider) => boolean,
  ): void;
}

interface ComputedKinematicController {
  numComputedCollisions(): number;
  computedCollision(i: number): {
    collider: {
      parent(): { userData?: unknown } | null;
      state?: { object?: { userData?: unknown } };
    } | null;
  } | null;
}

export function useKinematicObstacleController() {
  const { world } = useRapier();
  const desiredTranslation = useRef({ x: 0, y: 0, z: 0 });
  const characterController = useRef<ReturnType<typeof world.createCharacterController> | null>(
    null,
  );

  useEffect(() => {
    const controller = world.createCharacterController(KINEMATIC_OBSTACLE_OFFSET_M);
    controller.setSlideEnabled(true);
    controller.disableAutostep();
    characterController.current = controller;
    return () => {
      if (characterController.current === controller) characterController.current = null;
      controller.free();
    };
  }, [world]);

  return {
    clampMovement(
      collider: RapierCollider | null,
      moveX: number,
      moveZ: number,
    ): CorrectedPlanarMove {
      const controller = characterController.current;
      if (!controller || !collider || (moveX === 0 && moveZ === 0)) {
        return { x: moveX, z: moveZ, clamped: false, impactRole: undefined };
      }
      desiredTranslation.current.x = moveX;
      desiredTranslation.current.y = 0;
      desiredTranslation.current.z = moveZ;
      controller.computeColliderMovement(
        collider,
        desiredTranslation.current,
        KINEMATIC_OBSTACLE_FILTER,
        CHASSIS_COLLISION_GROUPS,
        isBlockingKinematicObstacle,
      );
      const corrected = controller.computedMovement();
      const clamped = Math.hypot(corrected.x - moveX, corrected.z - moveZ) > MOVEMENT_CLAMP_EPS;
      return {
        x: corrected.x,
        z: corrected.z,
        clamped,
        impactRole: clamped ? firstComputedCollisionRole(controller) : undefined,
      };
    },
    isPoseBlocked(collider: RapierCollider | null, pose: KinematicPose): boolean {
      return isKinematicChassisPoseBlocked(world, collider, pose);
    },
  };
}

export function isKinematicChassisPoseBlocked(
  world: KinematicShapeQueryWorld,
  collider: RapierCollider | null,
  pose: KinematicPose,
): boolean {
  if (!collider) return false;
  let blocked = false;
  world.intersectionsWithShape(
    pose.position,
    pose.rotation,
    collider.shape,
    (hit) => {
      if (!isBlockingKinematicObstacle(hit)) return true;
      blocked = true;
      return false;
    },
    KINEMATIC_OBSTACLE_FILTER,
    CHASSIS_COLLISION_GROUPS,
    collider,
    collider.parent() ?? undefined,
    isBlockingKinematicObstacle,
  );
  return blocked;
}

export function isBlockingKinematicObstacle(collider: RapierCollider): boolean {
  const bodyType = collider.parent()?.bodyType();
  if (bodyType !== undefined && bodyType !== FIXED_BODY_TYPE) return false;
  if (!collisionGroupsCanInteract(CHASSIS_COLLISION_GROUPS, collider.collisionGroups())) {
    return false;
  }
  if (collider.translation().y <= NON_BLOCKING_FLOOR_CENTER_Y_M) return false;
  if (collider.shapeType() !== ShapeType.Cuboid) return true;
  return collider.halfExtents().y > NON_BLOCKING_FLOOR_HALF_HEIGHT_M;
}

function collisionGroupsCanInteract(a: number, b: number): boolean {
  const aMembership = a >>> 16;
  const aFilter = a & 0xffff;
  const bMembership = b >>> 16;
  const bFilter = b & 0xffff;
  return (aMembership & bFilter) !== 0 && (bMembership & aFilter) !== 0;
}

function firstComputedCollisionRole(controller: ComputedKinematicController): unknown {
  for (let i = 0; i < controller.numComputedCollisions(); i += 1) {
    const collider = controller.computedCollision(i)?.collider;
    const role =
      readUserDataRole(collider?.parent()?.userData) ??
      readUserDataRole(collider?.state?.object?.userData);
    if (role !== undefined) return role;
  }
  return undefined;
}

function readUserDataRole(userData: unknown): unknown {
  if (typeof userData !== 'object' || userData === null || !('role' in userData)) {
    return undefined;
  }
  return userData.role;
}

import { ConvexHullCollider, CuboidCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import {
  CHASSIS_BOX_FRICTION,
  CHASSIS_BOX_HALF,
  CHASSIS_BOX_MASS,
  CHASSIS_BOX_X,
  CHASSIS_COLLIDER_Y,
  WEDGE_FRICTION,
  WEDGE_MASS,
  wedgeVertices,
} from './battleBodyShared.ts';

/**
 * Составной коллайдер боевого шасси: задняя коробка + передний клин.
 *
 * Общий для ЛОКАЛЬНОГО динамического робота и удалённого прокси — геометрия
 * боя обязана совпадать на обоих экранах, иначе заезд, видимый у атакующего,
 * физически невозможен у жертвы. Клин делает возможным то, что кубоид запрещал:
 * нос соперника скользит вверх по наклонной грани (≈32.5°, трение 0.12) и
 * попадает в зону диска ротора.
 */
export function BattleChassisColliders({ collisionGroups }: { collisionGroups: number }) {
  const wedge = useMemo(() => new Float32Array(wedgeVertices()), []);
  return (
    <>
      <CuboidCollider
        args={[CHASSIS_BOX_HALF[0], CHASSIS_BOX_HALF[1], CHASSIS_BOX_HALF[2]]}
        position={[CHASSIS_BOX_X, CHASSIS_COLLIDER_Y, 0]}
        mass={CHASSIS_BOX_MASS}
        friction={CHASSIS_BOX_FRICTION}
        restitution={0.05}
        collisionGroups={collisionGroups}
      />
      <ConvexHullCollider
        args={[wedge]}
        mass={WEDGE_MASS}
        friction={WEDGE_FRICTION}
        restitution={0.05}
        collisionGroups={collisionGroups}
      />
    </>
  );
}

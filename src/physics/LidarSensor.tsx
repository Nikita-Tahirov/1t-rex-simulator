import { Ray } from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useRef } from 'react';
import {
  LIDAR_BEAM_ANGLES,
  LIDAR_BEAM_COUNT,
  LIDAR_BEAM_HEIGHT_M,
  LIDAR_MAX_RANGE_M,
  lidar,
  resetLidar,
} from '@/sensors/lidar.ts';
import { ROBOT } from './constants.ts';
import { robotChassisRef } from './sharedRefs.ts';

/**
 * Раз в physics-кадр выполняет N raycast-ов из шасси робота в FOV лидара
 * и публикует результат в `lidar` (valtio).
 *
 * **Архитектура**: компонент НЕ рендерит ничего в three.js — это чистый
 * сенсорный модуль. Визуализация лучей живёт в {@link LidarVisualizer}.
 *
 * **Соглашения координат** (см. _pilotHelpers.ts, Robot.tsx):
 *   • Forward = +X в robot frame.
 *   • `yaw = 0` ↔ робот смотрит в +X. Положительный yaw поворачивает
 *     forward к +Z. Лучи остаются горизонтальными: pitch/roll шасси
 *     не заваливают плоскость сканирования лидара.
 *   • Угол луча `α` в robot frame: 0 = вперёд, +α = вправо (к +Z).
 *
 * **Производительность**: один Ray переиспользуется in-place. Никаких
 * аллокаций в hot path. RigidBody robot-а исключаем через
 * `filterExcludeRigidBody` — иначе первый же луч задевает корпус и
 * возвращает 0.
 */
export function LidarSensor() {
  const { world } = useRapier();
  // Один Ray на все лучи — мутируем .origin и .dir по месту.
  const rayRef = useRef<Ray | null>(null);
  if (rayRef.current === null) {
    rayRef.current = new Ray({ x: 0, y: LIDAR_BEAM_HEIGHT_M, z: 0 }, { x: 1, y: 0, z: 0 });
  }

  useEffect(() => {
    return () => {
      resetLidar();
    };
  }, []);

  useFrame(() => {
    const chassis = robotChassisRef.current;
    const ray = rayRef.current;
    if (!chassis || !ray) {
      lidar.active = false;
      return;
    }

    const t = chassis.translation();
    const rot = chassis.rotation();
    // Yaw из forward-вектора шасси (см. Robot.tsx — телеметрия yaw такая же).
    // forward = R · (1,0,0) в плоскости XZ. Используем минимальную формулу
    // без полного quaternion-multiply: достаточно знать (cos yaw, sin yaw),
    // где forward = (cos yaw, 0, sin yaw).
    // R(q)·(1,0,0).x = 1 − 2(y² + z²); R(q)·(1,0,0).z = 2(xy + wz).
    const fwdX = 1 - 2 * (rot.y * rot.y + rot.z * rot.z);
    const fwdZ = 2 * (rot.x * rot.y + rot.w * rot.z);
    const fwdLen = Math.hypot(fwdX, fwdZ) || 1;
    const cosY = fwdX / fwdLen;
    const sinY = fwdZ / fwdLen;

    ray.origin.x = t.x;
    ray.origin.y = t.y - ROBOT.chassisStartHeight + LIDAR_BEAM_HEIGHT_M;
    ray.origin.z = t.z;

    let minRange = Number.POSITIVE_INFINITY;
    let minBearing = 0;

    for (let i = 0; i < LIDAR_BEAM_COUNT; i += 1) {
      const alpha = LIDAR_BEAM_ANGLES[i] ?? 0;
      // Поворот forward на α в плоскости XZ. (cos yaw, sin yaw) поворачиваем
      // дополнительно на α, причём +α = вправо = к +Z.
      // d = R(α) · forward = (cosY·cosα − sinY·sinα,  sinY·cosα + cosY·sinα)
      // НО: «вправо» в нашей конвенции — это +Z, а математический поворот
      // вектора (cosY, sinY) на +α в плоскости (X,Z) даёт сдвиг к +Z, что
      // совпадает (yaw>0 = поворот к +Z, см. Robot.tsx).
      const cosA = Math.cos(alpha);
      const sinA = Math.sin(alpha);
      const dirX = cosY * cosA - sinY * sinA;
      const dirZ = sinY * cosA + cosY * sinA;
      ray.dir.x = dirX;
      ray.dir.y = 0;
      ray.dir.z = dirZ;

      const hit = world.castRayAndGetNormal(
        ray,
        LIDAR_MAX_RANGE_M,
        true,
        undefined,
        undefined,
        undefined,
        chassis,
      );
      if (hit && hit.timeOfImpact <= LIDAR_MAX_RANGE_M) {
        const r = hit.timeOfImpact;
        lidar.ranges[i] = r;
        lidar.hitX[i] = ray.origin.x + dirX * r;
        lidar.hitZ[i] = ray.origin.z + dirZ * r;
        lidar.normalX[i] = hit.normal.x;
        lidar.normalZ[i] = hit.normal.z;
        if (r < minRange) {
          minRange = r;
          minBearing = alpha;
        }
      } else {
        lidar.ranges[i] = Number.POSITIVE_INFINITY;
        lidar.hitX[i] = ray.origin.x + dirX * LIDAR_MAX_RANGE_M;
        lidar.hitZ[i] = ray.origin.z + dirZ * LIDAR_MAX_RANGE_M;
        lidar.normalX[i] = 0;
        lidar.normalZ[i] = 0;
      }
    }

    lidar.timestamp = performance.now() / 1000;
    lidar.active = true;
    lidar.minRange = minRange;
    lidar.minBearingRad = minBearing;
  });

  return null;
}

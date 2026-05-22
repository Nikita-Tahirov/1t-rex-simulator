import { CameraControls } from '@react-three/drei/core/CameraControls.js';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useSimStore } from '@/store/sim-store.ts';
import { telemetry } from '@/store/telemetry.ts';
import { ARENA } from './constants.ts';

declare global {
  interface Window {
    __cameraState?: {
      mode: string;
      x: number;
      y: number;
      z: number;
      targetX: number;
      targetY: number;
      targetZ: number;
    };
  }
}

/**
 * Камера с переключаемыми режимами:
 *   • orbit    — свободная орбита (Drei CameraControls)
 *   • follow   — за роботом сзади-сверху, плавно
 *   • shoulder — близко из-за спины робота, строго по продольной оси
 *   • top-down — сверху строго вниз
 *
 * **Сглаживание** (best-practice мая 2026):
 *
 *   • Frame-rate independent damping через `1 − exp(−dt/τ)`. Это эквивалентно
 *     critically-damped exponential decay с half-life ≈ τ·ln(2). Источник:
 *     [Spring-It-On (theorangeduck.com)] + three.js MathUtils.damp.
 *
 *   • **Единые τ-константы** (POSITION_TAU, YAW_TAU) без bifurcation на
 *     speed/yawRate-пороги. Раньше было `τ = speed<0.5 ? 1.2 : 0.18`, что
 *     давало discrete jump в момент пересечения порога — пользователь видел
 *     это как «дёргание». Решение — одна τ, подобранная для приятного TPS.
 *
 *   • **Yaw — единый damp (wrap-aware)** вместо двух веток
 *     «integrate yawRate vs lerp targetYaw». Раньше переключение между
 *     ветками порождало рывок при остановке вращения.
 *
 *   • **Shoulder mode уважает lerp**: ранее код после `camera.position.lerp`
 *     делал `camera.position.copy(tmpPos)`, ПОЛНОСТЬЮ перебивая lerp →
 *     shoulder была абсолютно несглажена. Теперь — единый pipeline.
 */

/** Half-life для позиции (секунды). Меньше — резче. 0.18 ≈ TPS-стандарт. */
const POSITION_HALFLIFE_SEC = 0.18;
/** Half-life для yaw — чуть больше, чтобы поворот не «отставал». */
const YAW_HALFLIFE_SEC = 0.12;
/** Порог dead-zone позиции — ниже этого камера не реагирует (солвер-jitter). */
const POSITION_DEADZONE_M = 0.0015;
const TOP_DOWN_CAMERA_Y = ARENA.size * 1.16;

/** Frame-rate independent damp. Возвращает `t` для `lerp(a, b, t)`. */
function dampT(halflife: number, dt: number): number {
  // 1 - 2^(-dt/halflife) — критически-затухающий экспоненциальный декей.
  return 1 - 2 ** (-dt / halflife);
}

/** Wrap-aware angular damp: возвращает новое значение yaw, кратчайшим путём. */
function dampAngle(current: number, target: number, halflife: number, dt: number): number {
  let dy = target - current;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  return current + dy * dampT(halflife, dt);
}

export function FollowCamera() {
  const cameraMode = useSimStore((s) => s.cameraMode);
  const controlsRef = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);
  const tmpTarget = useRef(new Vector3());
  const tmpPos = useRef(new Vector3());
  // Сглаженные значения позы робота — обновляются с большой постоянной времени.
  const smoothX = useRef(0);
  const smoothZ = useRef(0);
  const smoothYaw = useRef(0);
  // Флаг «только что вошли в follow/shoulder» — нужен для snap, не плавного lerp.
  const justEntered = useRef(false);
  const lastDrivenMode = useRef<string | null>(null);
  const orbitResetFrames = useRef(12);

  useEffect(() => {
    const controls = controlsRef.current;
    if (cameraMode === 'top-down') {
      controls?.setLookAt(0, TOP_DOWN_CAMERA_Y, 0.001, 0, 0, 0, false);
      publishCameraState(cameraMode, camera.position, tmpTarget.current.set(0, 0, 0));
      window.requestAnimationFrame(() => {
        controlsRef.current?.setLookAt(0, TOP_DOWN_CAMERA_Y, 0.001, 0, 0, 0, false);
      });
    } else if (cameraMode === 'orbit') {
      orbitResetFrames.current = 12;
      controls?.setLookAt(4, 3, 6, 0, 0.5, 0, false);
      publishCameraState(cameraMode, camera.position, tmpTarget.current.set(0, 0.5, 0));
      window.requestAnimationFrame(() => {
        controlsRef.current?.setLookAt(4, 3, 6, 0, 0.5, 0, false);
      });
    } else if (cameraMode === 'follow' || cameraMode === 'shoulder') {
      // Сбросить smoothed-позу к актуальной + флаг snap, чтобы камера прыгнула
      // на правильную позицию сразу, без долгого lerp из ORBIT-точки.
      smoothX.current = telemetry.positionX;
      smoothZ.current = telemetry.positionZ;
      smoothYaw.current = telemetry.yaw;
      justEntered.current = true;
      lastDrivenMode.current = null;
    }
  }, [camera, cameraMode]);

  useFrame((_, dt) => {
    if (cameraMode === 'orbit') {
      if (orbitResetFrames.current > 0) {
        camera.position.set(4, 3, 6);
        camera.lookAt(0, 0.5, 0);
        camera.updateMatrixWorld();
        controlsRef.current?.setLookAt(4, 3, 6, 0, 0.5, 0, false);
        orbitResetFrames.current -= 1;
      }
      publishCameraState(cameraMode, camera.position, tmpTarget.current.set(0, 0.5, 0));
      return;
    }
    if (cameraMode !== 'follow' && cameraMode !== 'shoulder') return;
    if (lastDrivenMode.current !== cameraMode) {
      smoothX.current = telemetry.positionX;
      smoothZ.current = telemetry.positionZ;
      smoothYaw.current = telemetry.yaw;
      justEntered.current = true;
      lastDrivenMode.current = cameraMode;
    }

    // Dead-zone на позиции: solver Rapier даёт микро-jitter ~< 1 мм когда робот
    // стоит. Без dead-zone камера это усиливает через lerp в реальную позицию.
    const dx = telemetry.positionX - smoothX.current;
    const dz = telemetry.positionZ - smoothZ.current;
    const posT = dampT(POSITION_HALFLIFE_SEC, dt);
    if (Math.abs(dx) > POSITION_DEADZONE_M) smoothX.current += dx * posT;
    if (Math.abs(dz) > POSITION_DEADZONE_M) smoothZ.current += dz * posT;
    smoothYaw.current = dampAngle(smoothYaw.current, telemetry.yaw, YAW_HALFLIFE_SEC, dt);

    const x = smoothX.current;
    const z = smoothZ.current;
    const yaw = smoothYaw.current;

    const forwardX = Math.cos(yaw);
    const forwardZ = Math.sin(yaw);

    if (cameraMode === 'shoulder') {
      tmpTarget.current.set(x + forwardX * 2.35, 0.74, z + forwardZ * 2.35);
      tmpPos.current.set(x - forwardX * 1.85, 1.08, z - forwardZ * 1.85);
    } else {
      const back = 3.0;
      const up = 3.0;
      tmpTarget.current.set(x, 0.6, z);
      tmpPos.current.set(x - forwardX * back, up, z - forwardZ * back);
    }

    if (justEntered.current) {
      // Жёсткий snap при входе — без долгого lerp от позиции ORBIT-камеры.
      camera.position.copy(tmpPos.current);
      justEntered.current = false;
    }
    // tmpPos уже сглажен через smoothX/Z/Yaw — поэтому camera.position просто
    // копируется. Раньше здесь был дополнительный lerp(camera.position, tmpPos,
    // camAlpha), но он создавал двойное затухание + bifurcation на пороге
    // speed/yawRate=0.5 → дёрганье. Единая модель сглаживания → плавно.
    camera.position.copy(tmpPos.current);
    camera.lookAt(tmpTarget.current);
    camera.updateMatrixWorld();
    controlsRef.current?.setLookAt(
      camera.position.x,
      camera.position.y,
      camera.position.z,
      tmpTarget.current.x,
      tmpTarget.current.y,
      tmpTarget.current.z,
      false,
    );
    publishCameraState(cameraMode, camera.position, tmpTarget.current);
  });

  return <CameraControls ref={controlsRef} makeDefault enabled={cameraMode === 'orbit'} />;
}

function publishCameraState(mode: string, position: Vector3, target: Vector3): void {
  if (typeof window === 'undefined') return;
  window.__cameraState = {
    mode,
    x: position.x,
    y: position.y,
    z: position.z,
    targetX: target.x,
    targetY: target.y,
    targetZ: target.z,
  };
}

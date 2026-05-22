import { Clone } from '@react-three/drei/core/Clone.js';
import { useGLTF } from '@react-three/drei/core/Gltf.js';
import { useMemo } from 'react';
import { type Mesh, MeshStandardMaterial, type Object3D } from 'three';

/**
 * Модель одного колеса 1T-REX.
 * Источник: `робот/glb-source/RobotYbiyca_Wheel.glb` → optimize+draco →
 * `public/models/1trex-wheel.glb` (~14 КБ после draco).
 *
 * Модель уже в метрах. Локальная ось вращения колеса в исходнике — X
 * (узкая координата); в физике симулятора ось вращения колеса = Z шасси.
 * Поэтому повёрнут вокруг Y на +π/2: переводит локальный +X модели в +Z мира.
 *
 * Используется в 4 экземплярах через drei `<Clone>` — это идиоматичный путь
 * 2026 для повторного использования одной GLB на нескольких трансформациях
 * (см. https://drei.docs.pmnd.rs/abstractions/clone). useGLTF кэширует
 * scene по URL, так что fetch и парсинг происходят один раз.
 */

useGLTF.setDecoderPath('/draco/');
useGLTF.preload('/models/1trex-wheel.glb');

const TYRE_COLOR = '#1a1a1f';

export function RobotWheelModel() {
  const { scene } = useGLTF('/models/1trex-wheel.glb');

  // Применяем тёмный материал «полиуретан/резина» один раз на shared-scene.
  useMemo(() => {
    const material = new MeshStandardMaterial({
      color: TYRE_COLOR,
      metalness: 0.1,
      roughness: 0.85,
    });
    scene.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = material;
      }
    });
  }, [scene]);

  // R_y(π/2): переводит локальную ось вращения модели (+X) в ось +Z симулятора.
  return <Clone object={scene} rotation={[0, Math.PI / 2, 0]} />;
}

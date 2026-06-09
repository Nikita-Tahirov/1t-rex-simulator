import { useGLTF } from '@react-three/drei/core/Gltf.js';
import { useMemo } from 'react';
import { type Mesh, MeshStandardMaterial, type Object3D } from 'three';

/**
 * Модель вертикального ротора 1T-REX (диск с зубьями).
 * Источник: `robot/glb-source/RobotYbiyca_Spinner.glb` → optimize+draco →
 * `public/models/1trex-spinner.glb` (~140 КБ).
 *
 * Локальная ось диска в исходнике — X (узкая координата). В физике ось
 * вращения ротора = Z шасси, поэтому group повёрнут на +π/2 вокруг Y
 * (переводит локальный +X в +Z).
 *
 * Якорь модели — её геометрический центр (bbox симметричен по всем осям),
 * совпадает с центром physics-RigidBody диска.
 */

useGLTF.setDecoderPath('/draco/');
useGLTF.preload('/models/1trex-spinner.glb');

const SPINNER_COLOR = '#ff3ea5';

export function RobotSpinnerModel() {
  const { scene } = useGLTF('/models/1trex-spinner.glb');

  useMemo(() => {
    const material = new MeshStandardMaterial({
      color: SPINNER_COLOR,
      metalness: 0.85,
      roughness: 0.25,
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

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <primitive object={scene} />
    </group>
  );
}

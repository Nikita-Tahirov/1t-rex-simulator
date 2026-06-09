import { useGLTF } from '@react-three/drei/core/Gltf.js';
import { useMemo } from 'react';
import { Box3, type Mesh, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import { ROBOT } from './constants.ts';

/**
 * Корпус 1T-REX — отдельная GLB-модель из CAD команды.
 * Источник: `robot/glb-source/RobotYbiyca_Corpus.glb` → optimize+draco → `public/models/1trex-corpus.glb`.
 * Модель в МЕТРАХ (Blender exporter), без текстур, plain PBR-материал.
 *
 * Самоориентация модели в исходнике (Blender):
 *   • Локальный +X — поперёк («право/лево» в model space)
 *   • Локальный +Y — вверх
 *   • Локальный −Z — нос (вперёд)
 *
 * После поворота `ROBOT.modelYawOffset = −π/2` вокруг Y:
 *   локальный −Z (нос) → +X мира (физический forward).
 *
 * Bbox исходника несимметричен по Z (нос длиннее хвоста на ≈0.15 м из-за
 * выступающих клиньев и кронштейна ротора). Центрируем модель по bbox по X
 * и Z — это совмещает геометрический центр корпуса с центром physics-кубоида,
 * и тогда колёсные ниши симметрично располагаются на ±wheelOffset вокруг
 * мирового нуля. По Y поднимаем модель так, чтобы её низ лёг на пол.
 */

useGLTF.setDecoderPath('/draco/');
useGLTF.preload('/models/1trex-corpus.glb');

interface Props {
  /** Цвет основной брони (по умолчанию — фирменный фиолетовый 1Т). */
  bodyColor?: string;
}

export function RobotCorpusModel({ bodyColor = '#5a3fd8' }: Props) {
  const { scene } = useGLTF('/models/1trex-corpus.glb');

  const { centerX, centerZ, minY } = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    const c = new Vector3();
    box.getCenter(c);
    return { centerX: c.x, centerZ: c.z, minY: box.min.y };
  }, [scene]);

  useMemo(() => {
    const material = new MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.65,
      roughness: 0.4,
    });
    scene.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = material;
      }
    });
  }, [scene, bodyColor]);

  return (
    <group rotation={[0, ROBOT.modelYawOffset, 0]}>
      <primitive object={scene} position={[-centerX, -minY, -centerZ]} />
    </group>
  );
}

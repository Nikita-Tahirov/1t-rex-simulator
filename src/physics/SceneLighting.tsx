/**
 * Освещение сцены 1T-REX (Industrial art direction).
 *
 * Hemisphere + ambient дают объём, directional light кидает динамическую
 * мягкую тень от движущегося робота. Две тёплые pointLight-вспышки
 * имитируют прожекторы испытательного полигона.
 *
 * **Тени**: `shadow-mapSize=2048²` + `PCFSoftShadowMap` (App.tsx).
 * 2026-05-15: размер карты теней поднят 1024² → 2048² — пиксельные тени
 * на корпусе робота и на полу под пандусами были визуально неприемлемы
 * для слайдов ВКР. Стоимость shadow-pass +3 ms на RTX 3080 Laptop
 * (≈ 1.5 → 4.5 ms), ¬критично при 60 Гц.
 * `shadow-bias=-0.00018` пропорционален разрешению (½ от 1024-значения),
 * `shadow-normalBias=0.05` убирает peter-panning на скруглённых
 * поверхностях ротора. Ortho-frustum зажат с 36 до 28: при ARENA.size=18
 * света [8,14,5] хватает с запасом, а тонкая depth-precision даёт более
 * чёткий контактный край тени.
 */

import { useArenaSize } from './arenaSize.ts';
import { ARENA } from './constants.ts';

const FLOOD_LIGHTS = [
  { id: 'center', color: '#ffeacc', intensity: 30, position: [0, 6.5, 0] },
  { id: 'rear', color: '#ffd9a0', intensity: 18, position: [0, 5.0, 4.7] },
] as const;

interface SceneLightingProps {
  /** Разрешение shadow map. Одиночка — 2048² (слайды ВКР); бой на слабом GPU — меньше. */
  shadowMapSize?: number;
  /** Кастовать ли тени вообще. На слабых устройствах бой отключает тени целиком. */
  castShadow?: boolean;
}

export function SceneLighting({
  shadowMapSize = 2048,
  castShadow = true,
}: SceneLightingProps = {}) {
  const arenaSize = useArenaSize();
  const shadowHalfSize = arenaSize / 2 + 1;
  // 18 м: far=28 (зажатый frustum для чёткой depth-precision, как было). Большая
  // арена требует пропорционально дальнего frustum, иначе тени обрезаются по краю.
  const shadowFar = arenaSize <= ARENA.size ? 28 : Math.ceil(arenaSize * 1.4);

  return (
    <group>
      <hemisphereLight args={['#e8e6dc', '#1a1a1f', 0.95]} />
      <ambientLight intensity={0.36} />
      <directionalLight
        position={[8, 14, 5]}
        intensity={2.55}
        castShadow={castShadow}
        shadow-bias={-0.00018}
        shadow-normalBias={0.05}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-shadowHalfSize}
        shadow-camera-right={shadowHalfSize}
        shadow-camera-top={shadowHalfSize}
        shadow-camera-bottom={-shadowHalfSize}
        shadow-camera-near={0.5}
        shadow-camera-far={shadowFar}
      />

      {FLOOD_LIGHTS.map((light) => (
        <pointLight
          key={light.id}
          color={light.color}
          distance={9}
          decay={1.25}
          intensity={light.intensity}
          position={light.position}
        />
      ))}
    </group>
  );
}

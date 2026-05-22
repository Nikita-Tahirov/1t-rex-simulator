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
import { ARENA } from './constants.ts';

const SHADOW_HALF_SIZE = ARENA.size / 2 + 1;
const FLOOD_LIGHTS = [
  { id: 'center', color: '#ffeacc', intensity: 30, position: [0, 6.5, 0] },
  { id: 'rear', color: '#ffd9a0', intensity: 18, position: [0, 5.0, 4.7] },
] as const;

export function SceneLighting() {
  return (
    <group>
      <hemisphereLight args={['#e8e6dc', '#1a1a1f', 0.95]} />
      <ambientLight intensity={0.36} />
      <directionalLight
        position={[8, 14, 5]}
        intensity={2.55}
        castShadow
        shadow-bias={-0.00018}
        shadow-normalBias={0.05}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-SHADOW_HALF_SIZE}
        shadow-camera-right={SHADOW_HALF_SIZE}
        shadow-camera-top={SHADOW_HALF_SIZE}
        shadow-camera-bottom={-SHADOW_HALF_SIZE}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
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

import { AdditiveBlending, BackSide } from 'three';
import { ARENA } from './constants.ts';

const SKY_VERTEX = `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Графитовый купол ангара: тёмный зенит, чуть светлее горизонт,
// тонкий тёплый ободок прожекторов на самом краю. Заменяет
// фиолетово-magenta небо предыдущей "neon-noir" редакции.
const SKY_FRAGMENT = `
varying vec3 vWorldPosition;

void main() {
  vec3 direction = normalize(vWorldPosition);
  float horizon = smoothstep(-0.18, 0.42, direction.y);
  float zenith = smoothstep(0.28, 0.96, direction.y);
  float rim = pow(1.0 - abs(direction.y), 6.0);

  vec3 floorGlow = vec3(0.072, 0.072, 0.080);
  vec3 horizonGlow = vec3(0.110, 0.108, 0.118);
  vec3 zenithColor = vec3(0.028, 0.028, 0.034);
  vec3 amberBand = vec3(0.230, 0.130, 0.040) * rim * 0.22;

  vec3 color = mix(floorGlow, horizonGlow, horizon);
  color = mix(color, zenithColor, zenith);
  color += amberBand;

  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Процедурный skybox: одна сфера-купол + тонкий тёплый ободок
 * прожекторов по горизонту. Industrial art direction: ангар-полигон,
 * без звёзд и неоновых колец. Без HDRI-fetch ∧ без bitmap-текстур
 * → быстрый cold start и стабильный COOP/COEP.
 */
export function SceneBackdrop() {
  return (
    <group>
      <mesh frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[90, 32, 16]} />
        <shaderMaterial
          attach="material"
          depthWrite={false}
          fragmentShader={SKY_FRAGMENT}
          side={BackSide}
          toneMapped={false}
          vertexShader={SKY_VERTEX}
        />
      </mesh>

      <HorizonRing radius={ARENA.size * 1.22} y={0.04} color="#ffb340" opacity={0.06} />
    </group>
  );
}

function HorizonRing({
  color,
  opacity,
  radius,
  y,
}: {
  color: string;
  opacity: number;
  radius: number;
  y: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} renderOrder={0}>
      <ringGeometry args={[radius - 0.015, radius, 96]} />
      <meshBasicMaterial
        blending={AdditiveBlending}
        color={color}
        depthWrite={false}
        opacity={opacity}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

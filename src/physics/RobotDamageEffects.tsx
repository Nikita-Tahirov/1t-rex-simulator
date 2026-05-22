import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, CanvasTexture, type Group } from 'three';
import { DAMAGE_EFFECT_COLORS } from '@/theme/tokens.ts';
import { ROBOT } from './constants.ts';
import { type RobotDamageSource, robotHealthRatio } from './robotDamage.ts';
import { damageEffectBaseY } from './robotDamageEffectsLayout.ts';

interface RobotDamageEffectsProps {
  health: number;
  lastSource: RobotDamageSource;
  /** «Свежий удар» (<650 мс) — считается в `useRobotDamageModel`, чтобы
   * render не вызывал `performance.now()` напрямую. */
  recentHit: boolean;
  showRealModel: boolean;
}

const SMOKE_PARTICLES = [
  { key: 'smoke-a', x: -0.1, y: 0, z: -0.07, size: 0.28, opacity: 1 },
  { key: 'smoke-b', x: 0.02, y: 0.09, z: 0.01, size: 0.4, opacity: 0.76 },
  { key: 'smoke-c', x: 0.15, y: 0.21, z: 0.08, size: 0.55, opacity: 0.54 },
  { key: 'smoke-d', x: -0.03, y: 0.33, z: 0.14, size: 0.46, opacity: 0.34 },
] as const;

const SPARK_PARTICLES = [
  { key: 'spark-a', x: 0, y: 0.02, z: -0.15, size: 0.035, color: DAMAGE_EFFECT_COLORS.sparkWarm },
  {
    key: 'spark-b',
    x: 0.04,
    y: 0.07,
    z: -0.04,
    size: 0.026,
    color: DAMAGE_EFFECT_COLORS.sparkCool,
  },
  { key: 'spark-c', x: -0.03, y: 0.04, z: 0.09, size: 0.032, color: DAMAGE_EFFECT_COLORS.sparkHot },
  {
    key: 'spark-d',
    x: 0.08,
    y: 0.09,
    z: 0.18,
    size: 0.024,
    color: DAMAGE_EFFECT_COLORS.sparkWhite,
  },
] as const;

export function RobotDamageEffects({
  health,
  lastSource,
  recentHit,
  showRealModel,
}: RobotDamageEffectsProps) {
  const smokeRef = useRef<Group>(null);
  const sparkRef = useRef<Group>(null);
  const flameRef = useRef<Group>(null);
  const scorchTexture = useMemo(
    () => createRadialTexture(DAMAGE_EFFECT_COLORS.scorch, 0.72, 0.08),
    [],
  );
  const smokeTexture = useMemo(
    () => createRadialTexture(DAMAGE_EFFECT_COLORS.smoke, 0.62, 0.2),
    [],
  );
  const sparkTexture = useMemo(() => createRadialTexture('#ffffff', 1, 0.28), []);
  const flameTexture = useMemo(
    () => createRadialTexture(DAMAGE_EFFECT_COLORS.flameOuter, 0.9, 0.14),
    [],
  );
  const ratio = robotHealthRatio(health);
  const damage = 1 - ratio;
  const sparkOpacity = recentHit || ratio < 0.7 ? Math.min(1, 0.22 + damage * 1.15) : 0;
  const smokeOpacity = ratio < 0.55 ? Math.min(0.62, (0.55 - ratio) * 1.35) : 0;
  const flameOpacity = ratio < 0.22 ? Math.min(0.82, (0.22 - ratio) * 4.2) : 0;
  const hotSpotX = lastSource === 'shredder' ? 0.2 : ROBOT.chassisLength / 2 - 0.08;
  const baseY = damageEffectBaseY(showRealModel);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (smokeRef.current) {
      smokeRef.current.position.y = baseY + 0.18 + Math.sin(t * 1.3) * 0.025;
      smokeRef.current.rotation.y = t * 0.16;
      smokeRef.current.scale.setScalar(1 + Math.sin(t * 0.9) * 0.08);
    }
    if (sparkRef.current) {
      sparkRef.current.rotation.z = Math.sin(t * 18) * 0.2;
      sparkRef.current.scale.setScalar(0.85 + Math.abs(Math.sin(t * 22)) * 0.35);
    }
    if (flameRef.current) {
      flameRef.current.position.y = baseY + 0.11 + Math.sin(t * 16) * 0.018;
      flameRef.current.scale.y = 0.78 + Math.abs(Math.sin(t * 11)) * 0.36;
    }
  });

  if (damage <= 0.02 && !recentHit) return null;

  return (
    <group>
      <sprite position={[0.04, baseY, 0]} scale={[0.7, 0.42, 1]}>
        <spriteMaterial
          map={scorchTexture}
          color={DAMAGE_EFFECT_COLORS.scorch}
          transparent
          opacity={damage * 0.22}
          depthWrite={false}
        />
      </sprite>
      <group ref={sparkRef} position={[hotSpotX, baseY + 0.06, 0]}>
        {SPARK_PARTICLES.map((particle) => (
          <sprite
            key={particle.key}
            position={[particle.x, particle.y, particle.z]}
            scale={[particle.size, particle.size, 1]}
          >
            <spriteMaterial
              map={sparkTexture}
              color={particle.color}
              transparent
              opacity={sparkOpacity}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </sprite>
        ))}
      </group>
      <group ref={smokeRef} position={[0.02, baseY + 0.18, -0.08]}>
        {SMOKE_PARTICLES.map((particle) => (
          <sprite
            key={particle.key}
            position={[particle.x, particle.y, particle.z]}
            scale={[particle.size, particle.size * 0.78, 1]}
          >
            <spriteMaterial
              map={smokeTexture}
              color={DAMAGE_EFFECT_COLORS.smoke}
              transparent
              opacity={smokeOpacity * particle.opacity}
              depthWrite={false}
            />
          </sprite>
        ))}
      </group>
      <group ref={flameRef} position={[0.08, baseY + 0.11, 0.16]}>
        <sprite scale={[0.22, 0.32, 1]}>
          <spriteMaterial
            map={flameTexture}
            color={DAMAGE_EFFECT_COLORS.flameOuter}
            transparent
            opacity={flameOpacity}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </sprite>
        <sprite position={[0.02, 0.04, 0]} scale={[0.11, 0.22, 1]}>
          <spriteMaterial
            map={flameTexture}
            color={DAMAGE_EFFECT_COLORS.flameInner}
            transparent
            opacity={flameOpacity * 0.75}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </sprite>
      </group>
    </group>
  );
}

function createRadialTexture(color: string, innerAlpha: number, edgeAlpha: number): CanvasTexture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new CanvasTexture(canvas);
  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 1, center, center, center);
  gradient.addColorStop(0, rgba(color, innerAlpha));
  gradient.addColorStop(0.45, rgba(color, edgeAlpha));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

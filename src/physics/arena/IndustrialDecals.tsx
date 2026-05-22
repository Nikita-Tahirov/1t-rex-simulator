import { Text } from '@react-three/drei/core/Text.js';
import { useMemo } from 'react';
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { ARENA } from '../constants.ts';
import { GROUND_LAYER_Y } from '../groundLayers.ts';
import { ARENA_TEXT_FONT_URL } from './arenaData.ts';

/**
 * Industrial-арт-дирекшен: жёлто-чёрная hazard-разметка по краю поля
 * ∧ крупная stencil-надпись «SECTOR · 1T-REX-04» в углу. Декорация,
 * никакой физики — все меши за пределами `RigidBody` коллайдера пола
 * не имеют, рисуются только.
 */

const HAZARD_STRIP_WIDTH = 0.5;
// Крупный паттерн (~1 пара полос на 0.7 m), чтобы в перспективе не уходил
// в субпиксельный moiré. Узкие тайлы (≥3/м) превращались в пунктирные точки
// на дальней стене — это и было видно на скриншоте обратной связи.
const HAZARD_REPEAT_PER_METER = 1.4;

function useHazardTexture(repeatX: number) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = '#ffb340';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#0a0a0c';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, 0);
    ctx.lineTo(0, 16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(32, 16);
    ctx.lineTo(32, 32);
    ctx.lineTo(16, 32);
    ctx.closePath();
    ctx.fill();

    const texture = new CanvasTexture(canvas);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    // Linear + mipmap + max anisotropy: без них узкие диагональные полосы
    // на дальнем плане схлопывались в субпиксельный пунктир (см. отчёт
    // 2026-05-15). С mipmap дальняя сторона арены плавно усредняется
    // до тёплой серо-жёлтой кромки.
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 16;
    texture.generateMipmaps = true;
    texture.repeat.set(repeatX, 1);
    return texture;
  }, [repeatX]);
}

export interface HazardPerimeterProps {
  /** Полу-сторона арены в метрах (ARENA.size / 2). */
  half: number;
}

export function HazardPerimeter({ half }: HazardPerimeterProps) {
  const length = half * 2;
  const longRepeat = Math.max(1, Math.round(length * HAZARD_REPEAT_PER_METER));
  const texture = useHazardTexture(longRepeat);

  if (!texture) {
    return null;
  }

  const offset = half - HAZARD_STRIP_WIDTH / 2;
  const y = GROUND_LAYER_Y.hazardPerimeter;
  const strips = [
    { rotation: [-Math.PI / 2, 0, 0] as const, position: [0, y, -offset] as const, id: 'n' },
    { rotation: [-Math.PI / 2, 0, 0] as const, position: [0, y, offset] as const, id: 's' },
    {
      rotation: [-Math.PI / 2, 0, Math.PI / 2] as const,
      position: [-offset, y, 0] as const,
      id: 'w',
    },
    {
      rotation: [-Math.PI / 2, 0, Math.PI / 2] as const,
      position: [offset, y, 0] as const,
      id: 'e',
    },
  ];

  return (
    <group>
      {strips.map((strip) => (
        <mesh key={strip.id} rotation={strip.rotation} position={strip.position} renderOrder={1}>
          <planeGeometry args={[length, HAZARD_STRIP_WIDTH]} />
          <meshBasicMaterial
            map={texture}
            transparent
            opacity={0.78}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Крупная служебная надпись на полу в SW-угле арены — sticker-«номер
 * полигона». Лежит плашмя, читается с верхней камеры; вне зон A/B/C/D.
 */
export function SectorStencil() {
  const half = ARENA.size / 2;
  return (
    <Text
      anchorX="left"
      anchorY="middle"
      color="#48484c"
      font={ARENA_TEXT_FONT_URL}
      fontSize={0.42}
      letterSpacing={0.18}
      position={[-half + 0.7, GROUND_LAYER_Y.sectorStencil, half - 0.7]}
      rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
      renderOrder={4}
    >
      SECTOR · 1T-REX-04
    </Text>
  );
}

import { GROUND_LAYER_Y } from './groundLayers.ts';

/**
 * Унифицированный кольцевой маркер сценария (старт, финиш, цель).
 *
 * Обёртка вокруг `<ringGeometry>` с правильно выставленным Y из
 * {@link GROUND_LAYER_Y} и `polygonOffset`-материалом. Все сценарии
 * рисуют свои наземные маркеры через этот компонент — централизованно
 * избавляемся от Z-fighting на полу арены, не дублируя material-props
 * в каждом setup-блоке.
 *
 * @example
 *   <SceneMarkerRing
 *     position={[3, 0]}
 *     innerRadius={0.45}
 *     outerRadius={0.6}
 *     color="#3ad29f"
 *     opacity={0.7}
 *   />
 */
export interface SceneMarkerRingProps {
  /** XZ-позиция центра кольца в мире, м. Y берётся автоматически. */
  position: readonly [number, number];
  innerRadius: number;
  outerRadius: number;
  color: string;
  opacity?: number;
  /** Сколько сегментов в круге (default 32). */
  segments?: number;
  /** Слой Y-стэка (по умолчанию `sceneMarker`). Возьми `coneBase` для
   *  напольных колец прицельно вокруг физических препятствий. */
  layer?: keyof typeof GROUND_LAYER_Y;
}

export function SceneMarkerRing({
  position,
  innerRadius,
  outerRadius,
  color,
  opacity = 0.7,
  segments = 32,
  layer = 'sceneMarker',
}: SceneMarkerRingProps) {
  return (
    <mesh
      position={[position[0], GROUND_LAYER_Y[layer], position[1]]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={5}
    >
      <ringGeometry args={[innerRadius, outerRadius, segments]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        polygonOffset
        polygonOffsetFactor={-5}
        polygonOffsetUnits={-5}
        depthWrite={false}
      />
    </mesh>
  );
}

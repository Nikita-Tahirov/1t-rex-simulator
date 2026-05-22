import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, type LineSegments } from 'three';
import {
  LIDAR_BEAM_COUNT,
  LIDAR_BEAM_HEIGHT_M,
  LIDAR_MAX_RANGE_M,
  lidar,
} from '@/sensors/lidar.ts';
import { useScenarioStore } from '@/store/scenario-store.ts';
import { useSimStore } from '@/store/sim-store.ts';
import { robotChassisRef } from './sharedRefs.ts';

/**
 * Рисует лучи лидара в сцене как набор `<lineSegments>`. Каждый луч —
 * пара точек (origin → hit). Цвет каждого сегмента зависит от близости
 * препятствия: дальше = циан (безопасно), ближе = розовый (опасно). Всё
 * запекается в `color`-attribute geometry в hot-path без перерендера React.
 *
 * Подписки на valtio здесь нет: useFrame читает `lidar` напрямую, поэтому
 * визуализатор обновляется со скоростью R3F-кадра, а не React-цикла.
 *
 * **Gating**: рендер скрыт если (a) пользователь не включил `showLidar`
 * И (b) нет активного запущенного сценария. Этим избегаем «трассеров»
 * на idle/паузе. Когда сценарий идёт — лучи показываются автоматически
 * как доказательство работы perception-стэка; вне сценария — только по
 * запросу пользователя.
 */
export function LidarVisualizer() {
  const lineRef = useRef<LineSegments>(null);
  const showLidar = useSimStore((s) => s.showLidar);
  const scenarioRunning = useScenarioStore((s) => s.status === 'running');
  const visible = showLidar || scenarioRunning;

  const { positions, colors } = useMemo(() => {
    return {
      positions: new Float32Array(LIDAR_BEAM_COUNT * 6),
      colors: new Float32Array(LIDAR_BEAM_COUNT * 6),
    };
  }, []);

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setAttribute('color', new BufferAttribute(colors, 3));
    return g;
  }, [positions, colors]);

  useFrame(() => {
    if (!visible) return;
    const chassis = robotChassisRef.current;
    if (!chassis) return;
    const pos = chassis.translation();
    const ox = pos.x;
    const oz = pos.z;

    const positionAttr = geometry.getAttribute('position') as BufferAttribute;
    const colorAttr = geometry.getAttribute('color') as BufferAttribute;
    const positionsArray = positionAttr.array as Float32Array;
    const colorsArray = colorAttr.array as Float32Array;

    for (let i = 0; i < LIDAR_BEAM_COUNT; i += 1) {
      const off = i * 6;
      // origin (центр шасси, поднятый на LIDAR_BEAM_HEIGHT_M)
      positionsArray[off + 0] = ox;
      positionsArray[off + 1] = LIDAR_BEAM_HEIGHT_M;
      positionsArray[off + 2] = oz;
      // hit
      const hx = lidar.hitX[i] ?? ox;
      const hz = lidar.hitZ[i] ?? oz;
      positionsArray[off + 3] = hx;
      positionsArray[off + 4] = LIDAR_BEAM_HEIGHT_M;
      positionsArray[off + 5] = hz;

      const r = lidar.ranges[i] ?? LIDAR_MAX_RANGE_M;
      // Цветовая шкала: cyan (0, 0.6, 1) ↔ pink (1, 0.24, 0.65)
      // t = 0 при r ≥ MAX → cyan; t = 1 при r ≤ 0.4 → pink.
      const danger = Math.min(1, Math.max(0, (LIDAR_MAX_RANGE_M - r) / (LIDAR_MAX_RANGE_M - 0.4)));
      const cR = 0.0 + (1.0 - 0.0) * danger;
      const cG = 0.6 + (0.24 - 0.6) * danger;
      const cB = 1.0 + (0.65 - 1.0) * danger;
      // Раскрашиваем оба конца сегмента одинаково.
      colorsArray[off + 0] = cR;
      colorsArray[off + 1] = cG;
      colorsArray[off + 2] = cB;
      colorsArray[off + 3] = cR;
      colorsArray[off + 4] = cG;
      colorsArray[off + 5] = cB;
    }
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return (
    <lineSegments ref={lineRef} geometry={geometry} renderOrder={3} visible={visible}>
      <lineBasicMaterial vertexColors transparent opacity={0.55} depthWrite={false} />
    </lineSegments>
  );
}

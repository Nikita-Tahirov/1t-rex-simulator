import { useFrame } from '@react-three/fiber';
import { forwardRef, Suspense, useRef } from 'react';
import type { Group } from 'three';
import { PLAYER_COLORS } from '@/theme/tokens.ts';
import { ROBOT } from '../constants.ts';
import { RobotCorpusModel } from '../RobotCorpusModel.tsx';
import { RobotDamageEffects } from '../RobotDamageEffects.tsx';
import { RobotSpinnerModel } from '../RobotSpinnerModel.tsx';
import { RobotWheelModel } from '../RobotWheelModel.tsx';
import { WHEEL_DEFS } from '../robotDefs.ts';
import type { RobotDamageVisualState } from '../useRobotDamageModel.ts';

/**
 * Визуальная сборка боевого робота: корпус (цвет игрока) + 4 колеса + крутящийся
 * ротор (accent-цвет игрока). Переиспользует те же GLB-модели, что и одиночка
 * (с per-instance раскраской). Внешний `group` отдаётся через ref — позу им
 * управляет Local/Remote-контроллер. Ротор крутится визуально (оружие активно).
 */

const SPINNER_VISUAL_OMEGA = 90;
const CORPUS_OFFSET_Y = -ROBOT.chassisHeight / 2 - ROBOT.wheelRadius;

interface Props {
  colorIndex: number;
  /** Визуальное состояние урона (только для локального робота — огонь/искры). */
  damageVisual?: RobotDamageVisualState;
}

export const BattleRobotVisual = forwardRef<Group, Props>(function BattleRobotVisual(
  { colorIndex, damageVisual },
  ref,
) {
  const spinRef = useRef<Group>(null);
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]!;

  useFrame((_, dt) => {
    if (spinRef.current) spinRef.current.rotation.z += SPINNER_VISUAL_OMEGA * Math.min(dt, 0.05);
  });

  return (
    <group ref={ref}>
      <group position={[0, CORPUS_OFFSET_Y, 0]}>
        <Suspense fallback={null}>
          <RobotCorpusModel bodyColor={color.body} />
        </Suspense>
      </group>
      {WHEEL_DEFS.map((wheel) => (
        <group key={wheel.name} position={[wheel.anchor[0], wheel.anchor[1], wheel.anchor[2]]}>
          <Suspense fallback={null}>
            <RobotWheelModel />
          </Suspense>
        </group>
      ))}
      <group position={[ROBOT.spinnerOffsetX, ROBOT.spinnerOffsetY, 0]}>
        <group ref={spinRef}>
          <Suspense fallback={null}>
            <RobotSpinnerModel spinnerColor={color.accent} />
          </Suspense>
        </group>
      </group>
      {damageVisual && (
        <RobotDamageEffects
          health={damageVisual.health}
          lastSource={damageVisual.lastSource}
          recentHit={damageVisual.recentHit}
          showRealModel
        />
      )}
    </group>
  );
});

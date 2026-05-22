import { Suspense } from 'react';
import { ROBOT } from './constants.ts';
import { RobotCorpusModel } from './RobotCorpusModel.tsx';
import { RobotDamageEffects } from './RobotDamageEffects.tsx';
import type { RobotDamageVisualState } from './useRobotDamageModel.ts';

interface RobotChassisVisualsProps {
  damage: RobotDamageVisualState;
  showRealModel: boolean;
}

export function RobotChassisVisuals({ damage, showRealModel }: RobotChassisVisualsProps) {
  return (
    <>
      {showRealModel ? (
        <group position={[0, -ROBOT.chassisHeight / 2 - ROBOT.wheelRadius, 0]}>
          <Suspense fallback={null}>
            <RobotCorpusModel />
          </Suspense>
        </group>
      ) : (
        <>
          <mesh castShadow>
            <boxGeometry args={[ROBOT.chassisLength, ROBOT.chassisHeight, ROBOT.chassisWidth]} />
            <meshStandardMaterial color="#6f4cff" metalness={0.4} roughness={0.45} />
          </mesh>
          <mesh position={[ROBOT.chassisLength / 2 + 0.04, 0, 0]} castShadow>
            <boxGeometry args={[0.08, 0.06, 0.4]} />
            <meshStandardMaterial color="#ff3ea5" metalness={0.5} roughness={0.4} />
          </mesh>
        </>
      )}
      <RobotDamageEffects
        health={damage.health}
        lastSource={damage.lastSource}
        recentHit={damage.recentHit}
        showRealModel={showRealModel}
      />
    </>
  );
}

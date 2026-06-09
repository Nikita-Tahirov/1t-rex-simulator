import { useEffect, useRef } from 'react';
import { telemetry } from '@/store/telemetry.ts';
import { STATE_PUBLISH_HZ } from '../battle/battleConfig.ts';
import type { NetSession } from '../session/useNetSession.ts';

/**
 * Публикует боевое состояние локального робота (поза + здоровье) в сеть с
 * фиксированной частотой `STATE_PUBLISH_HZ`. Источник — `telemetry`, куда
 * локальный `BattleRobot` пишет каждый кадр. Через `setInterval` (без setState),
 * поэтому годится вне `<Canvas>`.
 */
export function usePublishLocalState(session: NetSession): void {
  const seq = useRef(0);
  const { publishState } = session;

  useEffect(() => {
    const intervalMs = Math.round(1000 / STATE_PUBLISH_HZ);
    const timer = setInterval(() => {
      seq.current += 1;
      publishState({
        x: telemetry.positionX,
        z: telemetry.positionZ,
        yaw: telemetry.yaw,
        speed: telemetry.speed,
        health: telemetry.robotHealth,
        alive: telemetry.robotHealth > 0,
        seq: seq.current,
        t: Date.now(),
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [publishState]);
}

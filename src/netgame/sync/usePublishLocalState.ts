import { useEffect, useRef } from 'react';
import { dealtRecord } from '@/physics/battle/battleCombat.ts';
import { telemetry } from '@/store/telemetry.ts';
import { STATE_PUBLISH_HZ } from '../battle/battleConfig.ts';
import type { PlayerState } from '../net/types.ts';
import type { NetSession } from '../session/useNetSession.ts';

/**
 * Публикует боевое состояние локального робота (поза + обороты + здоровье + урон,
 * нанесённый соперникам) в сеть с частотой до `STATE_PUBLISH_HZ`. Источник —
 * `telemetry` + накопитель урона. Через `setInterval` (без setState), поэтому
 * годится вне `<Canvas>`.
 *
 * Оптимизация для слабого интернета: если поза/здоровье/урон практически не
 * изменились, публикация пропускается до keepalive-интервала — это режет
 * аплоад на простое, не ломая интерполяцию (получатель держит/экстраполирует позу).
 */
const KEEPALIVE_MS = 500;
const POS_EPS = 0.02;
const YAW_EPS = 0.01;
const SPEED_EPS = 0.05;
const RPM_EPS = 50;

export function usePublishLocalState(session: NetSession): void {
  const seq = useRef(0);
  const last = useRef<{ state: PlayerState; atMs: number } | null>(null);
  const { publishState } = session;

  useEffect(() => {
    const intervalMs = Math.round(1000 / STATE_PUBLISH_HZ);
    const timer = setInterval(() => {
      const nowMs = Date.now();
      const dealt = dealtRecord();
      const next: Omit<PlayerState, 'seq'> = {
        x: telemetry.positionX,
        z: telemetry.positionZ,
        yaw: telemetry.yaw,
        speed: telemetry.speed,
        spinnerRpm: telemetry.spinnerRpm,
        health: telemetry.robotHealth,
        alive: telemetry.robotHealth > 0,
        t: nowMs,
        dealt,
      };
      const prev = last.current;
      if (prev && nowMs - prev.atMs < KEEPALIVE_MS && !meaningfullyChanged(prev.state, next)) {
        return;
      }
      seq.current += 1;
      const state: PlayerState = { ...next, seq: seq.current };
      publishState(state);
      last.current = { state, atMs: nowMs };
    }, intervalMs);
    return () => clearInterval(timer);
  }, [publishState]);
}

function meaningfullyChanged(prev: PlayerState, next: Omit<PlayerState, 'seq'>): boolean {
  return (
    Math.abs(prev.x - next.x) > POS_EPS ||
    Math.abs(prev.z - next.z) > POS_EPS ||
    Math.abs(prev.yaw - next.yaw) > YAW_EPS ||
    Math.abs(prev.speed - next.speed) > SPEED_EPS ||
    Math.abs(prev.spinnerRpm - next.spinnerRpm) > RPM_EPS ||
    prev.health !== next.health ||
    prev.alive !== next.alive ||
    dealtChanged(prev.dealt, next.dealt)
  );
}

function dealtChanged(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) return true;
  }
  return false;
}

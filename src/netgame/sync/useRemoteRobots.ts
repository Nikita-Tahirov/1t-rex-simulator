import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import {
  type BattlePose,
  makeBattlePose,
  setBattlePose,
} from '@/physics/battle/battleRobotRegistry.ts';
import { EXTRAPOLATE_MAX_MS, INTERP_DELAY_MS } from '../battle/battleConfig.ts';
import { useNetRoomStore } from '../store/netRoomStore.ts';
import { pushSnapshot, type SampledPose, type Snapshot, sampleSnapshots } from './interpolation.ts';

/**
 * Интерполяция удалённых роботов: каждый кадр читает свежие `states` из стора,
 * копит снимки по uid и пишет интерполированную (на `INTERP_DELAY_MS` в прошлом)
 * ПОЛНУЮ позу (с высотой/ориентацией/скоростями) в общий реестр. Оттуда её берёт
 * удалённое динамическое тело (`RemoteDynamicRobot`) для следования. Вызывается
 * внутри `<Canvas>` (нужен `useFrame`).
 *
 * Время буфера — ЛОКАЛЬНОЕ (`performance.now()` на приёме), а не таймстемп
 * отправителя: часы клиентов не синхронизированы. При пропуске пакетов поза
 * коротко экстраполируется (`EXTRAPOLATE_MAX_MS`) по `vx,vz`, затем замирает.
 */
export function useRemoteRobots(localUid: string): void {
  const buffers = useRef(new Map<string, Snapshot[]>());
  const lastSeq = useRef(new Map<string, number>());
  const sampled = useRef<SampledPose>(makeSampledPose());
  const poseScratch = useRef<BattlePose>(makeBattlePose());

  useFrame(() => {
    const room = useNetRoomStore.getState().room;
    if (!room) return;
    const now = performance.now();
    const renderTime = now - INTERP_DELAY_MS;

    // for...in без Object.entries — нет per-frame аллокации массива/пар (hot-path).
    for (const uid in room.states) {
      const state = room.states[uid];
      if (!state || uid === localUid) continue;
      let buffer = buffers.current.get(uid);
      if (!buffer) {
        buffer = [];
        buffers.current.set(uid, buffer);
      }
      if (state.seq > (lastSeq.current.get(uid) ?? -1)) {
        lastSeq.current.set(uid, state.seq);
        // Штамп ЛОКАЛЬНЫМ временем приёма — иммунно к рассинхрону часов.
        pushSnapshot(buffer, {
          t: now,
          x: state.x,
          y: state.y,
          z: state.z,
          yaw: state.yaw,
          qx: state.qx,
          qy: state.qy,
          qz: state.qz,
          qw: state.qw,
          speed: state.speed,
          vx: state.vx,
          vz: state.vz,
          spinnerRpm: state.spinnerRpm,
          health: state.health,
          alive: state.alive,
        });
      }
      if (sampleSnapshots(buffer, renderTime, sampled.current, EXTRAPOLATE_MAX_MS)) {
        const s = sampled.current;
        const p = poseScratch.current;
        p.x = s.x;
        p.y = s.y;
        p.z = s.z;
        p.yaw = s.yaw;
        p.qx = s.qx;
        p.qy = s.qy;
        p.qz = s.qz;
        p.qw = s.qw;
        p.speed = s.speed;
        p.vx = s.vx;
        p.vz = s.vz;
        p.spinnerRpm = s.spinnerRpm;
        p.alive = s.alive;
        setBattlePose(uid, p);
      }
    }
  });
}

function makeSampledPose(): SampledPose {
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    speed: 0,
    vx: 0,
    vz: 0,
    spinnerRpm: 0,
    health: 0,
    alive: false,
  };
}

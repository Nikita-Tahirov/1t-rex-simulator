import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { setBattlePose } from '@/physics/battle/battleRobotRegistry.ts';
import { EXTRAPOLATE_MAX_MS, INTERP_DELAY_MS } from '../battle/battleConfig.ts';
import { useNetRoomStore } from '../store/netRoomStore.ts';
import { pushSnapshot, type SampledPose, type Snapshot, sampleSnapshots } from './interpolation.ts';

/**
 * Интерполяция удалённых роботов: каждый кадр читает свежие `states` из стора,
 * копит снимки по uid и пишет интерполированную (на `INTERP_DELAY_MS` в прошлом)
 * позу в общий реестр `battleRobotRegistry`. Оттуда её берут визуальные
 * `RemoteBattleRobot`. Вызывается внутри `<Canvas>` (нужен `useFrame`).
 *
 * Время буфера — ЛОКАЛЬНОЕ (`performance.now()` на приёме), а не таймстемп
 * отправителя: часы клиентов не синхронизированы, и сравнение чужого `Date.now()`
 * со своим ломало интерполяцию (главный источник рассинхрона). При пропуске
 * пакетов поза коротко экстраполируется (`EXTRAPOLATE_MAX_MS`), затем замирает.
 */
export function useRemoteRobots(localUid: string): void {
  const buffers = useRef(new Map<string, Snapshot[]>());
  const lastSeq = useRef(new Map<string, number>());
  const scratch = useRef<SampledPose>({
    x: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    spinnerRpm: 0,
    health: 0,
    alive: false,
  });

  useFrame(() => {
    const room = useNetRoomStore.getState().room;
    if (!room) return;
    const now = performance.now();
    const renderTime = now - INTERP_DELAY_MS;

    for (const [uid, state] of Object.entries(room.states)) {
      if (uid === localUid) continue;
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
          z: state.z,
          yaw: state.yaw,
          speed: state.speed,
          spinnerRpm: state.spinnerRpm,
          health: state.health,
          alive: state.alive,
        });
      }
      if (sampleSnapshots(buffer, renderTime, scratch.current, EXTRAPOLATE_MAX_MS)) {
        const pose = scratch.current;
        setBattlePose(uid, pose.x, pose.z, pose.yaw, pose.speed, pose.spinnerRpm, pose.alive);
      }
    }
  });
}

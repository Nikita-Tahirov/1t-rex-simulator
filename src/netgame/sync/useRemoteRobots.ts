import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { setBattlePose } from '@/physics/battle/battleRobotRegistry.ts';
import { INTERP_DELAY_MS } from '../battle/battleConfig.ts';
import { useNetRoomStore } from '../store/netRoomStore.ts';
import { pushSnapshot, type SampledPose, type Snapshot, sampleSnapshots } from './interpolation.ts';

/**
 * Интерполяция удалённых роботов: каждый кадр читает свежие `states` из стора,
 * копит таймстемпленные снимки по uid и пишет интерполированную (на
 * `INTERP_DELAY_MS` в прошлом) позу в общий реестр поз `battleRobotRegistry`.
 * Оттуда её берут визуальные `RemoteBattleRobot` и локальный контроллер (для
 * расталкивания/урона). Вызывается внутри `<Canvas>` (нужен `useFrame`).
 */
export function useRemoteRobots(localUid: string): void {
  const buffers = useRef(new Map<string, Snapshot[]>());
  const lastSeq = useRef(new Map<string, number>());
  const scratch = useRef<SampledPose>({
    x: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    health: 0,
    alive: false,
  });

  useFrame(() => {
    const room = useNetRoomStore.getState().room;
    if (!room) return;
    const now = Date.now();
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
        pushSnapshot(buffer, {
          t: state.t || now,
          x: state.x,
          z: state.z,
          yaw: state.yaw,
          speed: state.speed,
          health: state.health,
          alive: state.alive,
        });
      }
      if (sampleSnapshots(buffer, renderTime, scratch.current)) {
        const pose = scratch.current;
        setBattlePose(uid, pose.x, pose.z, pose.yaw, pose.speed, pose.alive);
      }
    }
  });
}

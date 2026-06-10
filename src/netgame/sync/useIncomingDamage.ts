import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { incomingDelta } from '@/physics/battle/battleCombat.ts';
import { applyRobotDamage } from '@/store/robotIntegrity.ts';
import { useNetRoomStore } from '../store/netRoomStore.ts';

/**
 * Применяет к СВОЕМУ здоровью урон, нанесённый соперниками (поле `dealt` в их
 * состоянии). Урон считает атакующий, а применяет жертва по дельте накопительного
 * счётчика — это переживает потери пакетов (нужно лишь последнее значение) и чинит
 * асимметрию интерполяции. Здоровье остаётся self-authoritative.
 *
 * `applied` хранит последнее учтённое значение от каждого атакующего. Первое
 * наблюдение лишь задаёт базис (без ретро-урона из прошлого матча); падение
 * счётчика ниже базиса = рестарт → новый базис. Сбрасывается при remount сцены.
 */
export function useIncomingDamage(localUid: string): void {
  const applied = useRef(new Map<string, number>());

  useFrame(() => {
    const room = useNetRoomStore.getState().room;
    if (!room) return;
    let total = 0;
    // for...in без Object.entries — нет per-frame аллокации массива/пар (hot-path).
    for (const attacker in room.states) {
      const state = room.states[attacker];
      if (!state || attacker === localUid) continue;
      const observed = state.dealt[localUid] ?? 0;
      const { delta, next } = incomingDelta(observed, applied.current.get(attacker));
      applied.current.set(attacker, next);
      total += delta;
    }
    if (total > 0) {
      applyRobotDamage({ amount: total, source: 'impact', nowMs: performance.now() });
    }
  });
}

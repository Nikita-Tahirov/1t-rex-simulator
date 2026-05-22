import { useSimStore } from '@/store/sim-store.ts';
import { goToTarget } from './_pilotHelpers.ts';
import type { Scenario } from './manager.ts';
import { SearchAndStrikeSpawn } from './searchAndStrikeSetup.tsx';
import { emitTargetHitIfInContact } from './targetContact.ts';
import { pickTargetPosition } from './targetPosition.ts';

/**
 * Сценарий «Поиск и удар».
 *
 * Цель — красный цилиндр (5 кг, динамический, но тяжёлый и с высоким трением)
 * размещён на случайной позиции в кольце радиусом 3-4 м от старта.
 * Робот в (0, 0, 0), ротор выключен. Тестируется FSM SEARCH→ENGAGE.
 *
 * Метрика — время от старта до первого события контакта между шасси/ротором робота
 * и целью. Цель: событие контакта зафиксировано.
 */

export const searchAndStrike: Scenario = {
  id: 'searchAndStrike',
  title: 'Поиск и удар',
  category: 'mission',
  description:
    'Автопилот наводится на цель (детерминированная позиция через начальное число генератора) и таранит её корпусом со включённым ротором. Метрика — время до контакта.',
  initialPose: { x: 0, z: 0, yaw: 0 },
  timeoutSec: 45,
  isAutonomyAllowed: true,

  setup: (ctx) => <SearchAndStrikeSpawn busEmit={(n, d) => ctx.bus.emit(n, d)} seed={ctx.seed} />,

  reset: () => {
    // Включаем ротор при старте сценария — лоб-в-лоб удар.
    useSimStore.getState().setSpinnerTargetRpm(5000);
  },

  pilot: (ctx) => {
    if (ctx.elapsedSec > 0.5 && ctx.bus.count('targetHit') > 0) {
      // После хита — стоп, чтобы не таранить дальше.
      ctx.setPilotInput({ active: true, throttle: 0, turn: 0, brake: 0 });
      return;
    }
    const target = pickTargetPosition(ctx.seed);
    goToTarget(ctx, {
      targetX: target.x,
      targetZ: target.z,
      arriveRadius: 0.2, // подъезжаем вплотную
      cruiseThrottle: 0.85,
      turnGain: 2.0,
      yawErrThrottleCut: 0.5,
      minMoveThrottle: 0.4,
    });
  },

  metric: (ctx) => {
    emitTargetHitIfInContact(ctx);
    return ctx.elapsedSec;
  },

  goal: (ctx) => ctx.elapsedSec > 0.5 && ctx.bus.count('targetHit') > 0,

  targetForFsm: (ctx) => pickTargetPosition(ctx.seed),
};

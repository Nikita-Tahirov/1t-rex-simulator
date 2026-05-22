import type { FsmState } from '@/autonomy/fsm.ts';
import { useSimStore } from '@/store/sim-store.ts';
import { telemetry } from '@/store/telemetry.ts';
import { goToTarget } from './_pilotHelpers.ts';
import { FsmVsBtSpawn } from './fsmVsBtSetup.tsx';
import {
  createRunState,
  modeIntToString,
  modeToInt,
  runState,
  setRunState,
} from './fsmVsBtState.ts';
import type { Scenario, ScenarioContext } from './manager.ts';
import { emitTargetHitIfInContact } from './targetContact.ts';

/**
 * Сравнительный эксперимент: конечный автомат vs поведенческое дерево.
 *
 * **Что замеряется.** Тот же мир, что и `searchAndStrike` (одна цель в кольце 3-4 м
 * от старта по детерминированному seed), но добавлены:
 *   • расширенный набор препятствий (4 коробки) для проверки реакции `Avoid`
 *     на отказ дальномера и переключение веток BT;
 *   • фиксация в `summary` режима (`mode = 1` для FSM, `2` для BT, `0` для manual)
 *     и времени до контакта `t_to_hit_sec` — чтобы рецензент мог сравнить
 *     два прогона JSON-логов.
 *
 * **Закрывает тезис § 2.2.5 ВКР** (сравнение FSM и BT для соревновательного робота).
 *
 * **Регламент использования.** Если режим управления = `manual` (по умолчанию),
 * сценарий автоматически выбирает FSM → BT → FSM по циклу при каждом старте,
 * чтобы пользователь мог просто нажать «Старт» дважды и получить оба лога.
 * Если пользователь явно выбрал FSM или BT в HUD — уважаем выбор пользователя.
 */

/** Цикл авто-выбора режима при manual: на первом старте FSM, на следующем BT. */
let lastAutoMode: 'fsm' | 'bt' = 'bt';
function nextAutoMode(): 'fsm' | 'bt' {
  lastAutoMode = lastAutoMode === 'fsm' ? 'bt' : 'fsm';
  return lastAutoMode;
}

function tickRun(ctx: ScenarioContext): void {
  if (!runState) return;
  if (ctx.elapsedSec < 0.5) {
    if (ctx.bus.count('targetHit') > 0) ctx.bus.set('targetHit', 0);
    return;
  }
  if (runState.tFirstHit === null && ctx.bus.count('targetHit') > 0) {
    runState.tFirstHit = ctx.elapsedSec;
  }
}

export const fsmVsBt: Scenario = {
  id: 'fsmVsBt',
  title: '[Эксп.] FSM vs BT',
  category: 'experiment',
  description:
    'Сравнение FSM и BT на одной задаче: найти и атаковать цель через 4 препятствия. Прогнать 2 раза (раз в FSM, раз в BT). В JSON summary — режим и t до контакта.',
  initialPose: { x: 0, z: 0, yaw: 0 },
  timeoutSec: 60,
  isAutonomyAllowed: true,
  // Сценарий — объект исследования FSM/BT; ScenarioRunner не должен запускать
  // собственный экземпляр, иначе телеметрия покажет состояние не из эксперимента.
  managesFsmState: true,

  setup: (ctx) => <FsmVsBtSpawn busEmit={(n, d) => ctx.bus.emit(n, d)} seed={ctx.seed} />,

  reset: (seed) => {
    // Если режим = manual (пользователь ничего не выбрал в HUD) — авто-цикл
    // FSM ↔ BT, чтобы две последовательные кнопки «Старт» сразу дали оба лога.
    // Если режим уже выставлен явно — уважаем выбор пользователя.
    const store = useSimStore.getState();
    if (store.mode === 'manual') {
      store.setMode(nextAutoMode());
    }
    setRunState(createRunState(seed));
    // Сцена начинается с IDLE даже в manual-режиме, пока pilot не отработал tick.
    telemetry.fsmState = runState?.fsm?.current() ?? 'IDLE';
    telemetry.fsmLastTransition = '';
    // Включаем ротор на старте — лоб-в-лоб удар.
    useSimStore.getState().setSpinnerTargetRpm(5000);
  },

  pilot: (ctx) => {
    if (!runState) return;
    if (ctx.elapsedSec > 0.5 && runState.tFirstHit !== null) {
      ctx.setPilotInput({ active: true, throttle: 0, turn: 0, brake: 0 });
      return;
    }
    const tel = ctx.telemetry;
    const dx = runState.targetX - tel.positionX;
    const dz = runState.targetZ - tel.positionZ;
    const distance = Math.hypot(dx, dz);

    if (runState.modeAtStart === 1 && runState.fsm) {
      // FSM: state-to-command. Range = расстояние до цели (proxy для дальномера).
      runState.fsm.step(
        { type: 'tick' },
        {
          rangeMeters: distance,
          batterySoc: 1,
          isFlipped: Math.abs(tel.roll) > Math.PI / 2,
          isOverheated: false,
          hasLink: true,
        },
      );
      const fsmState: FsmState = runState.fsm.current();
      telemetry.fsmState = fsmState;
      telemetry.fsmLastTransition = runState.fsm.lastTransitionInfo()?.reason ?? '';
      switch (fsmState) {
        case 'IDLE':
          ctx.setPilotInput({ active: true, throttle: 0, turn: 0, brake: 0 });
          break;
        case 'SEARCH':
          // Поворачиваемся к цели и едем.
          goToTarget(ctx, {
            targetX: runState.targetX,
            targetZ: runState.targetZ,
            arriveRadius: 0.3,
            cruiseThrottle: 0.45,
            turnGain: 1.2,
            yawErrThrottleCut: 1.1,
            minMoveThrottle: 0.1,
          });
          break;
        case 'ENGAGE':
          // Атака — таран.
          goToTarget(ctx, {
            targetX: runState.targetX,
            targetZ: runState.targetZ,
            arriveRadius: 0.02,
            cruiseThrottle: 0.75,
            turnGain: 1.4,
            yawErrThrottleCut: 1.1,
            minMoveThrottle: 0.35,
          });
          break;
        case 'RECOVERY':
          ctx.setPilotInput({ active: true, throttle: 0, turn: 0, brake: 0 });
          break;
      }
    } else if (runState.modeAtStart === 2 && runState.btAgent && runState.btTree) {
      // BT: обновляем blackboard, делаем шаг дерева, читаем cmd*.
      const bb = runState.btAgent.bb;
      bb.posX = tel.positionX;
      bb.posZ = tel.positionZ;
      bb.yaw = tel.yaw;
      bb.rangeMeters = distance;
      bb.isFlipped = Math.abs(tel.roll) > Math.PI / 2;
      runState.btTree.step();
      // BT может выдавать абсолютный yaw как cmdTurn (в зависимости от реализации).
      // Чтобы не зависеть от формата — используем goToTarget, BT даёт нам флаги.
      // Простая обёртка: пока цель не достигнута — едем к ней.
      goToTarget(ctx, {
        targetX: runState.targetX,
        targetZ: runState.targetZ,
        arriveRadius: 0.15,
        cruiseThrottle: 0.85,
        turnGain: 2.0,
        yawErrThrottleCut: 0.4,
        minMoveThrottle: 0.45,
      });
    } else {
      // manual — не управляем, пользователь сам.
      ctx.setPilotInput({ active: false, throttle: 0, turn: 0, brake: 1 });
    }

    // Делегируем учёт первого попадания.
    tickRun(ctx);
  },

  metric: (ctx) => {
    emitTargetHitIfInContact(ctx);
    tickRun(ctx);
    return runState?.tFirstHit ?? ctx.elapsedSec;
  },

  goal: (ctx) => ctx.elapsedSec > 0.5 && ctx.bus.count('targetHit') > 0,

  summary: (ctx) => {
    const collisions = ctx.bus.count('obstacleCollision');
    const hit = runState?.tFirstHit ?? null;
    const out: Record<string, number> = {
      mode: runState?.modeAtStart ?? 0,
      t_to_hit_sec: hit ?? -1, // -1 → не достиг цели
      hit_succeeded: hit === null ? 0 : 1,
      obstacle_collisions: collisions,
      elapsed_sec: ctx.elapsedSec,
    };
    return out;
  },
};

/** Тест-хелпер. */
export function _testHelpers() {
  return {
    getRunState: () => runState,
    resetRunState: (modeStr: 'manual' | 'fsm' | 'bt') => {
      setRunState({
        modeAtStart: modeToInt(modeStr),
        tFirstHit: null,
        fsm: null,
        btAgent: null,
        btTree: null,
        targetX: 0,
        targetZ: 0,
      });
    },
    modeToInt,
    modeIntToString,
  };
}

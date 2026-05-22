/**
 * Конечный автомат поведения 1T-REX (FSM).
 *
 * Состояния и переходы соответствуют отчёту по практике (раздел 3.2):
 *   IDLE  — простой, мотор хода и ротор выключены.
 *     → SEARCH (по команде engage от оператора/верхнего уровня)
 *     → IDLE   (по команде disengage)
 *   SEARCH — поиск цели/выполнение миссии.
 *     → ENGAGE (когда цель в зоне атаки: дальномер < threshold)
 *     → RECOVERY (при потере связи / аварии)
 *     → IDLE   (по disengage)
 *   ENGAGE — атака целью / выполнение действия.
 *     → SEARCH (когда цель потеряна)
 *     → RECOVERY (при перевороте / перегреве / низком АКБ)
 *     → IDLE   (по disengage)
 *   RECOVERY — восстановление: остановка ротора, ожидание оператора.
 *     → IDLE   (по resume / disengage)
 *
 * Эталонная реализация — структурно идентична C++-версии для МИК32 «Амур»
 * (одинаковый список состояний, события, имена переходов; различаются только
 * типы данных и системные вызовы).
 */

export type FsmState = 'IDLE' | 'SEARCH' | 'ENGAGE' | 'RECOVERY';

export interface FsmContext {
  /** Расстояние до ближайшего препятствия/цели по дальномеру, м. */
  rangeMeters: number;
  /** SOC АКБ, [0..1]. */
  batterySoc: number;
  /** Робот перевёрнут (|roll| > π/2)? */
  isFlipped: boolean;
  /** Перегрев приводов? */
  isOverheated: boolean;
  /** Связь с оператором (true — есть). */
  hasLink: boolean;
}

export interface FsmConfig {
  /** Расстояние до цели для перехода SEARCH → ENGAGE, м. */
  engageRange: number;
  /** Расстояние до цели для возврата ENGAGE → SEARCH, м (гистерезис). */
  disengageRange: number;
  /** Минимальный SOC, ниже — RECOVERY. */
  lowBatterySoc: number;
}

/**
 * Общая конфигурация FSM для штатных миссий 1T-REX. Используется ScenarioRunner,
 * чтобы все сценарии видели одни и те же пороги перехода. Эксперимент `fsmVsBt`
 * сознательно создаёт собственный экземпляр с другими порогами (см. fsmVsBtState).
 *
 * engageRange < disengageRange — обязательный гистерезис против дребезга.
 */
export const defaultFsmConfig: FsmConfig = {
  engageRange: 0.7,
  disengageRange: 1.2,
  lowBatterySoc: 0.1,
};

export interface FsmEvent {
  type: 'engage' | 'disengage' | 'resume' | 'tick';
}

export class BehaviorFSM {
  private state: FsmState = 'IDLE';
  private readonly cfg: FsmConfig;
  private lastTransition: { from: FsmState; to: FsmState; reason: string } | null = null;

  constructor(cfg: FsmConfig) {
    this.cfg = cfg;
  }

  current(): FsmState {
    return this.state;
  }

  lastTransitionInfo(): { from: FsmState; to: FsmState; reason: string } | null {
    return this.lastTransition;
  }

  /** Прокручивает один шаг автомата. Возвращает true если был переход. */
  step(event: FsmEvent, ctx: FsmContext): boolean {
    const prev = this.state;
    let reason = '';

    if (event.type === 'disengage') {
      this.state = 'IDLE';
      reason = 'оператор: disengage';
    } else if (event.type === 'engage' && this.state === 'IDLE') {
      this.state = 'SEARCH';
      reason = 'оператор: engage';
    } else if (event.type === 'resume' && this.state === 'RECOVERY') {
      this.state = 'IDLE';
      reason = 'оператор: resume';
    } else {
      // tick — событийный анализатор
      if (
        this.state !== 'IDLE' &&
        (ctx.isFlipped ||
          ctx.isOverheated ||
          ctx.batterySoc < this.cfg.lowBatterySoc ||
          !ctx.hasLink)
      ) {
        this.state = 'RECOVERY';
        reason = ctx.isFlipped
          ? 'переворот'
          : ctx.isOverheated
            ? 'перегрев'
            : !ctx.hasLink
              ? 'потеря связи'
              : 'низкий SOC';
      } else if (this.state === 'SEARCH' && ctx.rangeMeters < this.cfg.engageRange) {
        this.state = 'ENGAGE';
        reason = `цель в зоне (${ctx.rangeMeters.toFixed(2)} м)`;
      } else if (this.state === 'ENGAGE' && ctx.rangeMeters > this.cfg.disengageRange) {
        this.state = 'SEARCH';
        reason = `цель ушла (${ctx.rangeMeters.toFixed(2)} м)`;
      }
    }

    if (prev !== this.state) {
      this.lastTransition = { from: prev, to: this.state, reason };
      return true;
    }
    return false;
  }

  reset(): void {
    this.state = 'IDLE';
    this.lastTransition = null;
  }
}

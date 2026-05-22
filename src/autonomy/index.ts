/**
 * @packageDocumentation
 * Слой автономности 1T-REX — два альтернативных подхода к управлению миссией,
 * сравниваемые в эксперименте `fsmVsBt` (§ 2.2.5 ВКР).
 *
 * - `BehaviorFSM` — конечный автомат `IDLE → SEARCH → ENGAGE → RECOVERY`,
 *   повторяющий структуру прошивки для МК МИК32 «Амур». Имена и сигнатуры
 *   переходов зафиксированы как требование совместимости.
 * - `RobotBTAgent` + `makeBehaviorTree` — дерево поведения через DSL Mistreevous:
 *   `selector { Emergency → Engage → Avoid → Patrol }`.
 *
 * Оба модуля — чистый TypeScript без зависимостей от DOM, React и Rapier.
 *
 * @see [docs/architecture.md](../../docs/architecture.md) — слой автономности и его связи.
 */

export type { BTAgent, BTBlackboard } from './behavior-tree.ts';
export { makeBehaviorTree, RobotBTAgent } from './behavior-tree.ts';
export type { FsmConfig, FsmContext, FsmEvent, FsmState } from './fsm.ts';
export { BehaviorFSM, defaultFsmConfig } from './fsm.ts';

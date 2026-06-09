import { BehaviourTree, State } from 'mistreevous';
import { clamp } from '@/lib/math.ts';

/**
 * Дерево поведения автономного поведения 1T-REX.
 *
 * Использует Mistreevous (библиотека BT для TypeScript) — современный стандарт
 * для автономной робототехники (ROS2 Nav2, военные UAV-системы).
 *
 * Дерево описано в MDSL (Mistreevous DSL) — компактном текстовом формате:
 *   root — Selector ("ИЛИ"): пробует ветви по порядку
 *   ├─ EmergencyStop       (cond IsEmergency: перевёрнут / низкий АКБ / перегрев / нет связи)
 *   ├─ Engage              (cond HasTarget + TargetInRange)
 *   ├─ Avoid               (cond HasObstacle)
 *   └─ Patrol              (по умолчанию — поиск)
 *
 * Каждое действие возвращает Succeeded / Failed / Running.
 *
 * Эталонная реализация — структурно идентична верхнему уровню FSM
 * (`src/autonomy/fsm.ts`); BT — более гибкий планировщик миссии поверх FSM.
 */

export interface BTBlackboard {
  rangeMeters: number;
  batterySoc: number;
  isFlipped: boolean;
  isOverheated: boolean;
  hasLink: boolean;
  /** Целевая точка для патрулирования / атаки */
  targetX: number;
  targetZ: number;
  /** Текущее положение */
  posX: number;
  posZ: number;
  yaw: number;
  /** Команды на выход (заполняются agent-ами BT) */
  cmdThrottle: number;
  cmdTurn: number;
  cmdSpinnerRpm: number;
}

const BT_DEFINITION = `root {
  selector {
    sequence {
      condition [IsEmergency]
      action [EmergencyStop]
    }
    sequence {
      condition [HasTarget]
      condition [TargetInRange]
      action [Engage]
    }
    sequence {
      condition [HasObstacle]
      action [Avoid]
    }
    action [Patrol]
  }
}`;

export interface BTAgent {
  /** Condition functions — возвращают boolean. */
  IsEmergency(): boolean;
  HasTarget(): boolean;
  TargetInRange(): boolean;
  HasObstacle(): boolean;
  /** Action functions — возвращают State (Succeeded/Failed/Running). */
  EmergencyStop(): State;
  Engage(): State;
  Avoid(): State;
  Patrol(): State;
  /** Mistreevous Agent type требует индекс-сигнатуру для динамического lookup-а. */
  [key: string]: unknown;
}

export class RobotBTAgent implements BTAgent {
  public bb: BTBlackboard;
  private readonly engageRange: number;
  private readonly obstacleRange: number;
  private readonly lowSocThreshold: number;
  [key: string]: unknown;

  constructor(bb: BTBlackboard, engageRange = 1.5, obstacleRange = 1.0, lowSocThreshold = 0.1) {
    this.bb = bb;
    this.engageRange = engageRange;
    this.obstacleRange = obstacleRange;
    this.lowSocThreshold = lowSocThreshold;
  }

  IsEmergency(): boolean {
    return (
      this.bb.isFlipped ||
      this.bb.isOverheated ||
      !this.bb.hasLink ||
      this.bb.batterySoc < this.lowSocThreshold
    );
  }

  HasTarget(): boolean {
    return Number.isFinite(this.bb.targetX) && Number.isFinite(this.bb.targetZ);
  }

  TargetInRange(): boolean {
    const dx = this.bb.targetX - this.bb.posX;
    const dz = this.bb.targetZ - this.bb.posZ;
    return Math.hypot(dx, dz) < this.engageRange;
  }

  HasObstacle(): boolean {
    return this.bb.rangeMeters < this.obstacleRange;
  }

  EmergencyStop(): State {
    this.bb.cmdThrottle = 0;
    this.bb.cmdTurn = 0;
    this.bb.cmdSpinnerRpm = 0;
    return State.SUCCEEDED;
  }

  Engage(): State {
    const dx = this.bb.targetX - this.bb.posX;
    const dz = this.bb.targetZ - this.bb.posZ;
    const desiredYaw = Math.atan2(dz, dx);
    const yawErr = wrapPi(desiredYaw - this.bb.yaw);
    this.bb.cmdTurn = clamp(yawErr * 1.5, -1, 1);
    this.bb.cmdThrottle = Math.abs(yawErr) > 0.3 ? 0.2 : 0.7;
    this.bb.cmdSpinnerRpm = 5000;
    return State.RUNNING;
  }

  Avoid(): State {
    this.bb.cmdThrottle = -0.3;
    this.bb.cmdTurn = 0.7;
    this.bb.cmdSpinnerRpm = 0;
    return State.RUNNING;
  }

  Patrol(): State {
    // Поиск: медленное вращение + лёгкое движение вперёд
    this.bb.cmdThrottle = 0.4;
    this.bb.cmdTurn = 0.2;
    this.bb.cmdSpinnerRpm = 0;
    return State.RUNNING;
  }
}

export function makeBehaviorTree(agent: BTAgent): BehaviourTree {
  return new BehaviourTree(BT_DEFINITION, agent);
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

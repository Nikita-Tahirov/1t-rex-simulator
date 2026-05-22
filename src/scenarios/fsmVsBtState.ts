import { type BTBlackboard, makeBehaviorTree, RobotBTAgent } from '@/autonomy/behavior-tree.ts';
import { BehaviorFSM } from '@/autonomy/fsm.ts';
import { useSimStore } from '@/store/sim-store.ts';
import { pickTargetPosition } from './targetPosition.ts';

export interface RunState {
  modeAtStart: number;
  tFirstHit: number | null;
  fsm: BehaviorFSM | null;
  btAgent: RobotBTAgent | null;
  btTree: ReturnType<typeof makeBehaviorTree> | null;
  targetX: number;
  targetZ: number;
}

export let runState: RunState | null = null;

export function setRunState(next: RunState | null): void {
  runState = next;
}

export function modeToInt(mode: string): number {
  if (mode === 'fsm') return 1;
  if (mode === 'bt') return 2;
  return 0;
}

export function modeIntToString(m: number): string {
  if (m === 1) return 'fsm';
  if (m === 2) return 'bt';
  return 'manual';
}

export function createRunState(seed: number): RunState {
  const mode = useSimStore.getState().mode;
  const target = pickTargetPosition(seed);
  let fsm: BehaviorFSM | null = null;
  let btAgent: RobotBTAgent | null = null;
  let btTree: ReturnType<typeof makeBehaviorTree> | null = null;

  if (mode === 'fsm') {
    fsm = new BehaviorFSM({ engageRange: 1.5, disengageRange: 2.0, lowBatterySoc: 0.2 });
    fsm.step({ type: 'engage' }, baseFsmSensors());
  } else if (mode === 'bt') {
    const bb: BTBlackboard = {
      rangeMeters: Number.POSITIVE_INFINITY,
      batterySoc: 1,
      isFlipped: false,
      isOverheated: false,
      hasLink: true,
      targetX: target.x,
      targetZ: target.z,
      posX: 0,
      posZ: 0,
      yaw: 0,
      cmdThrottle: 0,
      cmdTurn: 0,
      cmdSpinnerRpm: 0,
    };
    btAgent = new RobotBTAgent(bb);
    btTree = makeBehaviorTree(btAgent);
  }

  return {
    modeAtStart: modeToInt(mode),
    tFirstHit: null,
    fsm,
    btAgent,
    btTree,
    targetX: target.x,
    targetZ: target.z,
  };
}

export function baseFsmSensors() {
  return {
    rangeMeters: Number.POSITIVE_INFINITY,
    batterySoc: 1,
    isFlipped: false,
    isOverheated: false,
    hasLink: true,
  };
}

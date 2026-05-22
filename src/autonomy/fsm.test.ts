import { describe, expect, it } from 'vitest';
import { BehaviorFSM, type FsmContext } from './fsm.ts';

const safeCtx: FsmContext = {
  rangeMeters: 10,
  batterySoc: 1,
  isFlipped: false,
  isOverheated: false,
  hasLink: true,
};

const cfg = { engageRange: 1.5, disengageRange: 2.5, lowBatterySoc: 0.1 };

describe('BehaviorFSM', () => {
  it('стартует из IDLE', () => {
    const fsm = new BehaviorFSM(cfg);
    expect(fsm.current()).toBe('IDLE');
  });

  it('IDLE → SEARCH по команде engage', () => {
    const fsm = new BehaviorFSM(cfg);
    fsm.step({ type: 'engage' }, safeCtx);
    expect(fsm.current()).toBe('SEARCH');
  });

  it('SEARCH → ENGAGE при цели в зоне', () => {
    const fsm = new BehaviorFSM(cfg);
    fsm.step({ type: 'engage' }, safeCtx);
    fsm.step({ type: 'tick' }, { ...safeCtx, rangeMeters: 1.0 });
    expect(fsm.current()).toBe('ENGAGE');
  });

  it('гистерезис ENGAGE → SEARCH (выход за disengageRange)', () => {
    const fsm = new BehaviorFSM(cfg);
    fsm.step({ type: 'engage' }, safeCtx);
    fsm.step({ type: 'tick' }, { ...safeCtx, rangeMeters: 1.0 });
    fsm.step({ type: 'tick' }, { ...safeCtx, rangeMeters: 2.0 }); // в гистерезисе — остаётся
    expect(fsm.current()).toBe('ENGAGE');
    fsm.step({ type: 'tick' }, { ...safeCtx, rangeMeters: 3.0 });
    expect(fsm.current()).toBe('SEARCH');
  });

  it('переворот → RECOVERY', () => {
    const fsm = new BehaviorFSM(cfg);
    fsm.step({ type: 'engage' }, safeCtx);
    fsm.step({ type: 'tick' }, { ...safeCtx, isFlipped: true });
    expect(fsm.current()).toBe('RECOVERY');
    expect(fsm.lastTransitionInfo()?.reason).toBe('переворот');
  });

  it('низкий SOC → RECOVERY', () => {
    const fsm = new BehaviorFSM(cfg);
    fsm.step({ type: 'engage' }, safeCtx);
    fsm.step({ type: 'tick' }, { ...safeCtx, batterySoc: 0.05 });
    expect(fsm.current()).toBe('RECOVERY');
  });

  it('disengage → IDLE из любого состояния', () => {
    const fsm = new BehaviorFSM(cfg);
    fsm.step({ type: 'engage' }, safeCtx);
    fsm.step({ type: 'tick' }, { ...safeCtx, rangeMeters: 1.0 });
    fsm.step({ type: 'disengage' }, safeCtx);
    expect(fsm.current()).toBe('IDLE');
  });

  it('resume из RECOVERY → IDLE', () => {
    const fsm = new BehaviorFSM(cfg);
    fsm.step({ type: 'engage' }, safeCtx);
    fsm.step({ type: 'tick' }, { ...safeCtx, isFlipped: true });
    fsm.step({ type: 'resume' }, safeCtx);
    expect(fsm.current()).toBe('IDLE');
  });

  it('reset возвращает в IDLE', () => {
    const fsm = new BehaviorFSM(cfg);
    fsm.step({ type: 'engage' }, safeCtx);
    fsm.reset();
    expect(fsm.current()).toBe('IDLE');
    expect(fsm.lastTransitionInfo()).toBeNull();
  });
});

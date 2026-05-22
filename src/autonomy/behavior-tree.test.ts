import { describe, expect, it } from 'vitest';
import { type BTBlackboard, makeBehaviorTree, RobotBTAgent } from './behavior-tree.ts';

const baseBB = (): BTBlackboard => ({
  rangeMeters: 10,
  batterySoc: 1,
  isFlipped: false,
  isOverheated: false,
  hasLink: true,
  targetX: 5,
  targetZ: 0,
  posX: 0,
  posZ: 0,
  yaw: 0,
  cmdThrottle: 0,
  cmdTurn: 0,
  cmdSpinnerRpm: 0,
});

describe('BehaviorTree (Mistreevous)', () => {
  it('строится без ошибок по MDSL', () => {
    const bt = makeBehaviorTree(new RobotBTAgent(baseBB()));
    expect(bt).toBeDefined();
  });

  it('Patrol: цель далеко, ничего критического → выдаёт patrol-команды', () => {
    const bb = baseBB();
    bb.targetX = 50; // далеко
    const agent = new RobotBTAgent(bb);
    const bt = makeBehaviorTree(agent);
    bt.step();
    expect(bb.cmdThrottle).toBeGreaterThan(0);
    expect(bb.cmdSpinnerRpm).toBe(0);
  });

  it('Engage: цель в зоне → раскрутка ротора', () => {
    const bb = baseBB();
    bb.targetX = 1.0; // в зоне engageRange=1.5
    bb.targetZ = 0.5;
    const agent = new RobotBTAgent(bb);
    const bt = makeBehaviorTree(agent);
    bt.step();
    expect(bb.cmdSpinnerRpm).toBeGreaterThan(0);
  });

  it('Emergency: переворот → полная остановка', () => {
    const bb = baseBB();
    bb.isFlipped = true;
    const agent = new RobotBTAgent(bb);
    const bt = makeBehaviorTree(agent);
    bt.step();
    expect(bb.cmdThrottle).toBe(0);
    expect(bb.cmdSpinnerRpm).toBe(0);
  });

  it('Avoid: препятствие близко (но не emergency) → задний ход + поворот', () => {
    const bb = baseBB();
    bb.rangeMeters = 0.5; // ближе obstacleRange=1.0
    bb.targetX = 50; // нет цели в зоне
    const agent = new RobotBTAgent(bb);
    const bt = makeBehaviorTree(agent);
    bt.step();
    expect(bb.cmdThrottle).toBeLessThan(0);
    expect(bb.cmdTurn).not.toBe(0);
  });

  it('Низкий SOC активирует Emergency-ветвь', () => {
    const bb = baseBB();
    bb.batterySoc = 0.05;
    const agent = new RobotBTAgent(bb);
    const bt = makeBehaviorTree(agent);
    bt.step();
    expect(bb.cmdThrottle).toBe(0);
    expect(bb.cmdSpinnerRpm).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { BODY_PID_BASE, makeRobotBodyPidStep, RobotBodyPid } from './robotBodyPid.ts';

const DEFAULT_GAINS = { kp: 1, ki: 0, kd: 0 } as const;

describe('RobotBodyPid', () => {
  it('сходится к линейной цели за конечное время', () => {
    const pid = new RobotBodyPid();
    pid.setGains(DEFAULT_GAINS);
    const out = makeRobotBodyPidStep();
    const dt = 1 / 60;
    let v = 0;
    for (let i = 0; i < 600; i += 1) {
      pid.step(3, 0, v, 0, dt, out);
      v = out.linear;
    }
    expect(v).toBeCloseTo(3, 2);
  });

  it('воспроизводит прежнее low-pass поведение при дефолтных gains (τ_linear≈0.25 с)', () => {
    const pid = new RobotBodyPid();
    pid.setGains(DEFAULT_GAINS);
    const out = makeRobotBodyPidStep();
    const dt = 1 / 60;
    pid.step(5, 0, 0, 0, dt, out);
    const expected = 5 * (1 - Math.exp(-dt / 0.25));
    // Допуск 15% — точное соответствие невозможно (PID + clamp != чистый low-pass),
    // но порядок отклика тот же.
    expect(out.linear).toBeGreaterThan(expected * 0.85);
    expect(out.linear).toBeLessThan(expected * 1.15);
  });

  it('реактивно подхватывает новые gains через setGains (kp ↑ → быстрее разгон)', () => {
    const dt = 1 / 60;
    const slow = new RobotBodyPid();
    slow.setGains({ kp: 0.3, ki: 0, kd: 0 });
    const fast = new RobotBodyPid();
    fast.setGains({ kp: 2.5, ki: 0, kd: 0 });
    const o1 = makeRobotBodyPidStep();
    const o2 = makeRobotBodyPidStep();
    let vSlow = 0;
    let vFast = 0;
    for (let i = 0; i < 5; i += 1) {
      slow.step(5, 0, vSlow, 0, dt, o1);
      fast.step(5, 0, vFast, 0, dt, o2);
      vSlow = o1.linear;
      vFast = o2.linear;
    }
    expect(vFast).toBeGreaterThan(vSlow * 1.3);
  });

  it('асимметричный clamp: тормозит медленнее, чем разгоняется', () => {
    const pid = new RobotBodyPid();
    pid.setGains({ kp: 3, ki: 0, kd: 0 }); // насыщение clamp гарантировано
    const out = makeRobotBodyPidStep();
    const dt = 1 / 60;
    pid.step(5, 0, 0, 0, dt, out);
    const accelStep = out.linear;
    pid.reset();
    pid.step(0, 0, 5, 0, dt, out);
    const coastStep = 5 - out.linear;
    expect(accelStep).toBeGreaterThan(coastStep * 1.5);
  });

  it('сходится к угловой цели за конечное время', () => {
    const pid = new RobotBodyPid();
    pid.setGains(DEFAULT_GAINS);
    const out = makeRobotBodyPidStep();
    const dt = 1 / 60;
    let w = 0;
    for (let i = 0; i < 300; i += 1) {
      pid.step(0, 2, 0, w, dt, out);
      w = out.angular;
    }
    expect(w).toBeCloseTo(2, 2);
  });

  it('линейное и угловое ускорения зажаты в accelLimit', () => {
    const pid = new RobotBodyPid();
    pid.setGains({ kp: 3, ki: 3, kd: 0 });
    const out = makeRobotBodyPidStep();
    pid.step(100, 100, 0, 0, 1 / 60, out);
    expect(Math.abs(out.linearAccel)).toBeLessThanOrEqual(BODY_PID_BASE.linearAccelLimit + 1e-9);
    expect(Math.abs(out.angularAccel)).toBeLessThanOrEqual(BODY_PID_BASE.angularAccelLimit + 1e-9);
  });

  it('reset обнуляет интеграторы — следующий шаг считает от нуля', () => {
    const pid = new RobotBodyPid();
    pid.setGains({ kp: 0.5, ki: 1, kd: 0 });
    const out = makeRobotBodyPidStep();
    for (let i = 0; i < 50; i += 1) pid.step(2, 0, 0, 0, 1 / 60, out);
    pid.reset();
    pid.step(2, 0, 0, 0, 1 / 60, out);
    // После reset интегратор пуст — за один шаг шасси не успевает накопить
    // существенной скорости (только P-составляющая)
    expect(out.linear).toBeLessThan(0.1);
  });
});

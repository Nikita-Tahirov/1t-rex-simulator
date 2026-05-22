import { BehaviorFSM, defaultFsmConfig, type FsmContext } from '@/autonomy/fsm.ts';
import { resetRobotPowerTelemetry } from '@/physics/robotPower.ts';
import { resetRobotIntegrity } from '@/store/robotIntegrity.ts';
import {
  getScenarioLog,
  type PilotInput,
  type ScenarioLogEntry,
  type ScenarioStatus,
  useScenarioStore,
} from '@/store/scenario-store.ts';
import { useSimStore } from '@/store/sim-store.ts';
import { telemetry } from '@/store/telemetry.ts';
import { ScenarioEventBus } from './ScenarioEventBus.ts';
import type {
  Scenario,
  ScenarioContext,
  ScenarioEvent,
  ScenarioListener,
} from './scenario-types.ts';
import { verifyScenarioLog } from './verification.ts';

export class ScenarioRunner {
  readonly scenario: Scenario;
  readonly bus: ScenarioEventBus;
  readonly seed: number;
  private listeners = new Set<ScenarioListener>();
  private elapsedSec = 0;
  private lastLogAt = 0;
  private status: 'idle' | 'running' | 'completed' | 'failed' = 'idle';
  private readonly ctx: ScenarioContext;
  private readonly fsm: BehaviorFSM | null;
  private readonly setPilotInput = (p: Partial<PilotInput>): void => {
    useScenarioStore.getState().setPilotInput(p);
  };

  constructor(scenario: Scenario, bus: ScenarioEventBus = new ScenarioEventBus(), seed = 0) {
    this.scenario = scenario;
    this.bus = bus;
    this.seed = seed >>> 0;
    this.ctx = {
      elapsedSec: 0,
      dt: 0,
      telemetry,
      bus: this.bus,
      seed: this.seed,
      setPilotInput: this.setPilotInput,
    };
    this.fsm = scenario.managesFsmState ? null : new BehaviorFSM(defaultFsmConfig);
    if (this.fsm) {
      // При смене сценария старый рантайм мог оставить ENGAGE/SEARCH в телеметрии.
      telemetry.fsmState = 'IDLE';
      telemetry.fsmLastTransition = '';
    }
  }

  start(): void {
    this.elapsedSec = 0;
    this.lastLogAt = 0;
    this.bus.reset();
    useSimStore.getState().setSpinnerTargetRpm(0);
    this.scenario.reset?.(this.seed);
    this.status = 'running';
    this.emit({ type: 'started', scenarioId: this.scenario.id });

    const store = useScenarioStore.getState();
    store.bumpRunId();
    store.resetLog();
    store.setStatus('running');
    store.setElapsed(0);
    store.setMetricValue(0);
    store.setMessage('');
    store.setSummary({});
    store.setVerification(null);
    const initialPose = this.scenario.initialPose ?? { x: 0, z: 0, yaw: 0 };
    store.clearPilotInput();
    store.setCommandSource('scenario');
    store.requestRobotReset(initialPose);
    syncTelemetryToPose(initialPose);
    this.engageFsm();
  }

  abort(): void {
    if (this.status !== 'running') return;
    this.status = 'failed';
    this.emit({ type: 'failed', reason: 'aborted', elapsedSec: this.elapsedSec });
    const store = useScenarioStore.getState();
    store.setStatus('failed');
    store.setMessage('Прервано пользователем');
    store.setVerification(null);
    store.clearPilotInput();
    store.setCommandSource('keyboard');
    this.disengageFsm();
  }

  stop(): void {
    if (this.status !== 'running') return;
    this.status = 'idle';
    const store = useScenarioStore.getState();
    store.clearPilotInput();
    store.setCommandSource('keyboard');
    this.disengageFsm();
  }

  tick(dt: number): void {
    if (this.status !== 'running') return;
    this.elapsedSec += dt;
    this.ctx.elapsedSec = this.elapsedSec;
    this.ctx.dt = dt;

    this.scenario.pilot?.(this.ctx);
    const metricValue = this.scenario.metric(this.ctx);
    this.tickFsm();
    const store = useScenarioStore.getState();
    store.setElapsed(this.elapsedSec);
    store.setMetricValue(metricValue);

    if (this.elapsedSec - this.lastLogAt >= 0.1) {
      this.lastLogAt = this.elapsedSec;
      this.appendLogEntry(metricValue);
    }

    this.emit({ type: 'progress', elapsedSec: this.elapsedSec, metricValue });
    if (this.scenario.goal(this.ctx)) {
      this.complete(metricValue, store, 'completed');
      return;
    }
    if (this.elapsedSec >= this.scenario.timeoutSec) {
      const finalStatus: ScenarioStatus = this.scenario.completeOnTimeout ? 'completed' : 'failed';
      this.complete(metricValue, store, finalStatus);
    }
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  on(listener: ScenarioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private complete(
    metricValue: number,
    store: ReturnType<typeof useScenarioStore.getState>,
    finalStatus: ScenarioStatus,
  ): void {
    this.status = finalStatus;
    if (Math.abs(this.elapsedSec - this.lastLogAt) > 1e-6) {
      this.lastLogAt = this.elapsedSec;
      this.appendLogEntry(metricValue);
    }
    this.publishSummary(this.ctx);
    if (finalStatus === 'completed') {
      this.emit({ type: 'completed', elapsedSec: this.elapsedSec, metricValue });
      store.setStatus('completed');
      store.setMessage(this.completionMessage());
    } else {
      this.emit({ type: 'failed', reason: 'timeout', elapsedSec: this.elapsedSec });
      store.setStatus('failed');
      store.setMessage(`Таймаут ${this.scenario.timeoutSec} с истёк`);
    }
    this.publishVerification(finalStatus);
    store.clearPilotInput();
    store.setCommandSource('keyboard');
    this.disengageFsm();
  }

  private engageFsm(): void {
    if (!this.fsm) return;
    this.fsm.reset();
    this.fsm.step({ type: 'engage' }, this.collectFsmContext());
    telemetry.fsmState = this.fsm.current();
    telemetry.fsmLastTransition = this.fsm.lastTransitionInfo()?.reason ?? '';
  }

  private tickFsm(): void {
    if (!this.fsm) return;
    const changed = this.fsm.step({ type: 'tick' }, this.collectFsmContext());
    if (changed) {
      telemetry.fsmState = this.fsm.current();
      telemetry.fsmLastTransition = this.fsm.lastTransitionInfo()?.reason ?? '';
    }
  }

  private disengageFsm(): void {
    if (!this.fsm) return;
    this.fsm.step({ type: 'disengage' }, this.collectFsmContext());
    telemetry.fsmState = this.fsm.current();
    telemetry.fsmLastTransition = this.fsm.lastTransitionInfo()?.reason ?? '';
  }

  private collectFsmContext(): FsmContext {
    const target = this.scenario.targetForFsm?.(this.ctx) ?? null;
    const rangeMeters = target
      ? Math.hypot(target.x - telemetry.positionX, target.z - telemetry.positionZ)
      : Number.POSITIVE_INFINITY;
    return {
      rangeMeters,
      batterySoc: telemetry.batterySoc,
      isFlipped: Math.abs(telemetry.filteredRoll) > Math.PI / 2,
      isOverheated: false,
      hasLink: true,
    };
  }

  private completionMessage(): string {
    if (this.elapsedSec >= this.scenario.timeoutSec && this.scenario.completeOnTimeout) {
      return `Окно измерения ${this.scenario.timeoutSec} с завершено`;
    }
    return `Цель достигнута за ${this.elapsedSec.toFixed(1)} с`;
  }

  private publishSummary(ctx: ScenarioContext): void {
    if (!this.scenario.summary) return;
    try {
      useScenarioStore.getState().setSummary(this.scenario.summary(ctx));
    } catch (err) {
      console.warn(`Scenario ${this.scenario.id} summary error:`, err);
    }
  }

  private appendLogEntry(metricValue: number): void {
    const wc = telemetry.wheelCurrent;
    const wt = telemetry.wheelTemperature;
    const pilot = useScenarioStore.getState().pilotInput;
    const events = this.bus.snapshot();
    const entry: ScenarioLogEntry = {
      t: this.elapsedSec,
      x: telemetry.positionX,
      z: telemetry.positionZ,
      yaw: telemetry.yaw,
      speed: telemetry.speed,
      yawRate: telemetry.yawRate,
      spinnerRpm: telemetry.spinnerRpm,
      batterySoc: telemetry.batterySoc,
      batteryVoltageLoad: telemetry.batteryVoltageLoad,
      batteryCurrent: telemetry.batteryCurrent,
      batteryTemperature: telemetry.batteryTemperature,
      wheelCurrent: [wc[0], wc[1], wc[2], wc[3]],
      wheelTemperature: [wt[0], wt[1], wt[2], wt[3]],
      filteredRoll: telemetry.filteredRoll,
      filteredPitch: telemetry.filteredPitch,
      filteredYaw: telemetry.filteredYaw,
      rangeMeters: telemetry.rangeMeters,
      arenaDamage: telemetry.arenaDamage,
      robotHealth: telemetry.robotHealth,
      robotDamage: telemetry.robotDamage,
      robotDamageLastSource: telemetry.robotDamageLastSource,
      robotDamageLastEnergyJ: telemetry.robotDamageLastEnergyJ,
      robotDamageLastForceN: telemetry.robotDamageLastForceN,
      fsmState: telemetry.fsmState,
      metricValue,
      pilotActive: pilot.active,
      pilotThrottle: pilot.throttle,
      pilotTurn: pilot.turn,
      pilotBrake: pilot.brake,
      ...(Object.keys(events).length > 0 ? { events } : {}),
    };
    useScenarioStore.getState().appendLog(entry);
  }

  private publishVerification(status: ScenarioStatus): void {
    const store = useScenarioStore.getState();
    const verification = verifyScenarioLog({
      scenarioId: this.scenario.id,
      seed: this.seed,
      status,
      elapsedSec: this.elapsedSec,
      metricValue: store.metricValue,
      entries: Array.from(getScenarioLog()),
      summary: store.summary,
    });
    store.setVerification(verification);
  }

  private emit(e: ScenarioEvent): void {
    for (const listener of this.listeners) listener(e);
  }
}

function syncTelemetryToPose(pose: { x: number; z: number; yaw: number }): void {
  telemetry.positionX = pose.x;
  telemetry.positionZ = pose.z;
  telemetry.yaw = pose.yaw;
  telemetry.speed = 0;
  telemetry.yawRate = 0;
  telemetry.spinnerRpm = 0;
  telemetry.spinnerTargetRpm = useSimStore.getState().spinnerTargetRpm;
  resetRobotPowerTelemetry();
  resetRobotIntegrity();
}

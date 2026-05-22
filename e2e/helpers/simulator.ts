import type { Page } from '@playwright/test';

type PilotPatch = Partial<{ active: boolean; throttle: number; turn: number; brake: number }>;
type TraceEntry = { x: number; z: number; speed?: number; yawRate?: number; pilotActive?: boolean };

declare global {
  interface Window {
    __telemetry?: {
      positionX: number;
      positionY: number;
      positionZ: number;
      yaw: number;
      yawRate: number;
      speed: number;
      spinnerRpm: number;
      batterySoc: number;
      batteryVoltageOpen: number;
      batteryVoltageLoad: number;
      batteryCurrent: number;
      robotHealth: number;
    };
    __cameraState?: { mode: string; x: number; y: number; z: number };
    __sceneRenderState?: { meshCount: number; renderCalls: number };
    __simStore?: {
      getState: () => { mode: string; setMode: (m: 'manual' | 'fsm' | 'bt') => void };
    };
    __shredderRotor?: { getAngle: () => number; setAngleOverride: (angle: number | null) => void };
    __scenarioStore?: {
      getState: () => {
        currentScenarioId: string;
        status: string;
        runId: number;
        elapsedSec: number;
        summary: Record<string, number>;
        verification: VerificationPayload | null;
        pilotInput: { active: boolean; throttle: number; turn: number; brake: number };
        commandSource: string;
        setPilotInput: (p: PilotPatch) => void;
        setCommandSource: (source: 'keyboard' | 'scenario') => void;
        setStatus: (s: 'idle' | 'running' | 'completed' | 'failed') => void;
        setCurrentScenarioId: (id: string) => void;
        setSummary: (s: Record<string, number>) => void;
        resetLog: () => void;
        exportLog: () => Blob;
        requestRobotReset: (pose: { x: number; z: number; yaw: number }) => void;
      };
    };
    __scenarioRunner?: {
      current: { scenario: { id: string } } | null;
      fastForward: (totalSec: number, stepSec?: number) => void;
    };
  }
}

interface VerificationPayload {
  passed: boolean;
  score: number;
  checks: Array<{ id: string; passed: boolean; expected: string; actual: string }>;
}

export interface VerificationRun {
  id: string;
  mode?: 'fsm' | 'bt';
  timeoutMs: number;
}

interface MovementResult {
  distance: number;
  pathLength: number;
  speed: number;
  yawRate: number;
  pilotActive: boolean;
}

export const verificationRuns: VerificationRun[] = [
  { id: 'obstacleAvoidance', timeoutMs: 60_000 },
  { id: 'searchAndStrike', timeoutMs: 90_000 },
  { id: 'spinnerImpact', timeoutMs: 60_000 },
  { id: 'fsmVsBt', mode: 'bt', timeoutMs: 90_000 },
  { id: 'fsmVsBt', mode: 'fsm', timeoutMs: 90_000 },
  { id: 'figureEight', timeoutMs: 150_000 },
  { id: 'madgwickVsComplementary', timeoutMs: 90_000 },
  { id: 'brownoutDischarge', timeoutMs: 90_000 },
];

export async function openSimulator(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__telemetry);
  await page.waitForFunction(() => (window.__telemetry?.positionY ?? 0) !== 0);
  await page.waitForFunction(() => {
    const scene = window.__sceneRenderState;
    return !!window.__cameraState && (scene?.meshCount ?? 0) > 20 && (scene?.renderCalls ?? 0) > 0;
  });
  await page.waitForFunction(() => !!window.__scenarioStore);
}

export async function setKey(page: Page, code: string, pressed: boolean): Promise<void> {
  await page.evaluate(
    ({ code, pressed }) => {
      window.dispatchEvent(
        new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
          bubbles: true,
          code,
          key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
        }),
      );
    },
    { code, pressed },
  );
}

export async function waitForScenarioRunner(page: Page, scenarioId: string): Promise<void> {
  await page.waitForFunction(
    (id) =>
      window.__scenarioStore?.getState().currentScenarioId === id &&
      window.__scenarioRunner?.current?.scenario.id === id,
    scenarioId,
  );
}

export async function runScenarioRealtime(
  page: Page,
  scenarioId: string,
  seconds: number,
): Promise<MovementResult> {
  await page.evaluate((id) => {
    window.__scenarioStore?.getState().setStatus('idle');
    window.__scenarioStore?.getState().setCurrentScenarioId(id);
  }, scenarioId);
  await waitForScenarioRunner(page, scenarioId);
  await page.evaluate(() => window.__scenarioStore?.getState().setStatus('running'));
  await page.waitForFunction(() => (window.__scenarioStore?.getState().elapsedSec ?? 0) > 0);
  const start = await page.evaluate(() => ({
    x: window.__telemetry?.positionX ?? 0,
    z: window.__telemetry?.positionZ ?? 0,
  }));
  await startPilotSampler(page);
  await page.waitForTimeout(seconds * 1000);
  const pilotActive = await stopPilotSampler(page);
  const traceStats = await readTraceStats(page);
  const end = await page.evaluate(() => ({
    x: window.__telemetry?.positionX ?? 0,
    z: window.__telemetry?.positionZ ?? 0,
    speed: window.__telemetry?.speed ?? 0,
  }));
  await page.evaluate(() => window.__scenarioStore?.getState().setStatus('idle'));
  return {
    distance: Math.hypot(end.x - start.x, end.z - start.z),
    pathLength: traceStats.pathLength,
    speed: Math.max(end.speed, traceStats.maxSpeed),
    yawRate: traceStats.maxAbsYawRate,
    pilotActive: pilotActive || traceStats.pilotActive,
  };
}

export async function runScenarioToVerification(
  page: Page,
  run: VerificationRun,
): Promise<{
  label: string;
  status: string;
  elapsedSec: number;
  passed: boolean;
  score: number;
  failedChecks: Array<{ id: string; expected: string; actual: string }>;
}> {
  const label = run.mode ? `${run.id}:${run.mode}` : run.id;
  const startRunId = await page.evaluate(({ id, mode }) => {
    const scenarioStore = window.__scenarioStore?.getState();
    if (!scenarioStore) return -1;
    scenarioStore.setStatus('idle');
    scenarioStore.resetLog();
    if (mode) window.__simStore?.getState().setMode(mode);
    scenarioStore.setCurrentScenarioId(id);
    return scenarioStore.runId;
  }, run);
  await waitForScenarioRunner(page, run.id);
  await page.evaluate(() => window.__scenarioStore?.getState().setStatus('running'));
  await page.waitForFunction(
    (previousRunId) => {
      const state = window.__scenarioStore?.getState();
      return state?.status === 'running' && (state?.runId ?? -1) > previousRunId;
    },
    startRunId,
    { timeout: 10_000 },
  );
  await page.waitForFunction(() => window.__scenarioStore?.getState().status !== 'running', null, {
    timeout: run.timeoutMs,
  });
  const payload = await readScenarioPayload(page, run.id, startRunId + 1);
  const fallbackState = payload ? null : await readFallbackState(page);
  await page.evaluate(() => {
    window.__scenarioStore?.getState().setStatus('idle');
    window.__simStore?.getState().setMode('manual');
  });
  const verification = payload?.verification;
  return {
    label: fallbackState
      ? `${label} (state=${fallbackState.currentScenarioId}/${fallbackState.status}/runId=${fallbackState.runId})`
      : label,
    status: payload?.status ?? 'missing-log',
    elapsedSec: payload?.elapsedSec ?? fallbackState?.elapsedSec ?? 0,
    passed: verification?.passed ?? false,
    score: verification?.score ?? 0,
    failedChecks:
      verification?.checks
        .filter((check) => !check.passed)
        .map((check) => ({ id: check.id, expected: check.expected, actual: check.actual })) ?? [],
  };
}

async function startPilotSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    type W = Window & { __pilotActiveSeen?: boolean; __pilotSamplerId?: number };
    const w = window as W;
    w.__pilotActiveSeen = false;
    w.__pilotSamplerId = window.setInterval(() => {
      if (w.__scenarioStore?.getState().pilotInput.active) w.__pilotActiveSeen = true;
    }, 50);
  });
}

async function stopPilotSampler(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    type W = Window & { __pilotActiveSeen?: boolean; __pilotSamplerId?: number };
    const w = window as W;
    if (w.__pilotSamplerId !== undefined) clearInterval(w.__pilotSamplerId);
    return w.__pilotActiveSeen ?? false;
  });
}

async function readTraceStats(
  page: Page,
): Promise<{ pilotActive: boolean; pathLength: number; maxSpeed: number; maxAbsYawRate: number }> {
  return page.evaluate(async () => {
    const blob = window.__scenarioStore?.getState().exportLog();
    if (!blob) return { pilotActive: false, pathLength: 0, maxSpeed: 0, maxAbsYawRate: 0 };
    const payload = JSON.parse(await blob.text()) as { entries?: TraceEntry[] };
    const entries = payload.entries ?? [];
    let pathLength = 0;
    let maxSpeed = 0;
    let maxAbsYawRate = 0;
    for (let i = 1; i < entries.length; i += 1) {
      const prev = entries[i - 1]!;
      const current = entries[i]!;
      pathLength += Math.hypot(current.x - prev.x, current.z - prev.z);
      maxSpeed = Math.max(maxSpeed, Math.abs(current.speed ?? 0));
      maxAbsYawRate = Math.max(maxAbsYawRate, Math.abs(current.yawRate ?? 0));
    }
    return {
      pilotActive: entries.some((entry) => entry.pilotActive),
      pathLength,
      maxSpeed,
      maxAbsYawRate,
    };
  });
}

async function readScenarioPayload(page: Page, id: string, expectedRunId: number) {
  return page.evaluate(
    async ({ scenarioId, runId }) => {
      const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        const blob = window.__scenarioStore?.getState().exportLog();
        if (blob) {
          const parsed = JSON.parse(await blob.text()) as {
            scenarioId?: string;
            runId?: number;
            status: string;
            elapsedSec: number;
            verification?: VerificationPayload;
          };
          if (parsed.scenarioId === scenarioId && parsed.runId === runId && parsed.verification) {
            return parsed;
          }
        }
        await delay(100);
      }
      return null;
    },
    { scenarioId: id, runId: expectedRunId },
  );
}

async function readFallbackState(page: Page) {
  return page.evaluate(() => {
    const state = window.__scenarioStore?.getState();
    return state
      ? {
          currentScenarioId: state.currentScenarioId,
          status: state.status,
          runId: state.runId,
          elapsedSec: state.elapsedSec,
          hasVerification: !!state.verification,
        }
      : null;
  });
}

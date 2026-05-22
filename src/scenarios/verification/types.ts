import type {
  ScenarioLogEntry,
  ScenarioStatus,
  ScenarioVerificationCheck,
  ScenarioVerificationResult,
} from '@/store/scenario-store.ts';

export interface ScenarioVerificationPayload {
  scenarioId: string;
  seed: number;
  status: ScenarioStatus;
  elapsedSec: number;
  metricValue: number;
  entries: ScenarioLogEntry[];
  summary?: Record<string, number>;
}

export interface CheckDraft {
  id: string;
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface TraceStats {
  sampleCount: number;
  pathLengthM: number;
  maxSpeedMps: number;
  maxAbsYawRate: number;
  pilotActiveRatio: number;
  maxAbsThrottle: number;
  maxAbsTurn: number;
  commandResponseRatio: number;
  lateralTravelM: number;
  zAxisCrossings: number;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  maxSegmentDtSec: number;
  maxSegmentSpeedMps: number;
}

export type { ScenarioVerificationCheck, ScenarioVerificationResult };

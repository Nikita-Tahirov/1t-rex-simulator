import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Глобальный стор симулятора.
 *
 * Содержит «медленное» состояние, которое меняется по действиям пользователя:
 *   • Режим управления (ручной / FSM / BT)
 *   • Камера
 *   • PID-коэффициенты, варьируемые из инженерной панели
 *   • Параметры АКБ, моторов
 *   • Параметры арены и текущий сценарий
 *
 * Высокочастотная телеметрия (60+ Гц гейджи, графики, позы) — НЕ здесь, а через
 * valtio в `src/store/telemetry.ts` (создаётся в фазе панели индикации), чтобы избежать
 * перерендеров React-дерева на каждый physics step.
 */

export type ControlMode = 'manual' | 'fsm' | 'bt';
export type CameraMode = 'orbit' | 'follow' | 'shoulder' | 'top-down';

export interface PIDGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface SimState {
  mode: ControlMode;
  cameraMode: CameraMode;
  paused: boolean;
  showRealModel: boolean;
  /** Видимость лучей лидара в сцене. По умолчанию off — лучи не должны
   *  отвлекать на idle/паузе. Включается пользователем или сценарием. */
  showLidar: boolean;
  drivePid: PIDGains;
  spinnerPid: PIDGains;
  spinnerTargetRpm: number;

  setMode: (m: ControlMode) => void;
  setCameraMode: (m: CameraMode) => void;
  setPaused: (p: boolean) => void;
  togglePaused: () => void;
  toggleRealModel: () => void;
  toggleLidar: () => void;
  setDrivePid: (g: Partial<PIDGains>) => void;
  setSpinnerPid: (g: Partial<PIDGains>) => void;
  setSpinnerTargetRpm: (rpm: number) => void;
}

export const useSimStore = create<SimState>()(
  subscribeWithSelector((set) => ({
    mode: 'manual',
    cameraMode: 'orbit',
    paused: false,
    showRealModel: true,
    showLidar: false,
    // Нормированные gains в диапазоне 0..3: умножаются на физические базовые
    // коэффициенты в robotBodyPid.ts (drive) и Spinner.tsx (rotor). Дефолтный
    // чистый P-loop {1, 0, 0} калиброван так, чтобы отклик ≈ прежнему low-pass
    // (τ_linear≈0.25 c); I/D пользователь добавляет вручную для тонкой настройки.
    drivePid: { kp: 1, ki: 0, kd: 0 },
    spinnerPid: { kp: 1, ki: 0, kd: 0 },
    spinnerTargetRpm: 0,

    setMode: (m) => set({ mode: m }),
    setCameraMode: (m) => set({ cameraMode: m }),
    setPaused: (p) => set({ paused: p }),
    togglePaused: () => set((s) => ({ paused: !s.paused })),
    toggleRealModel: () => set((s) => ({ showRealModel: !s.showRealModel })),
    toggleLidar: () => set((s) => ({ showLidar: !s.showLidar })),
    setDrivePid: (g) => set((s) => ({ drivePid: { ...s.drivePid, ...g } })),
    setSpinnerPid: (g) => set((s) => ({ spinnerPid: { ...s.spinnerPid, ...g } })),
    setSpinnerTargetRpm: (rpm) => set({ spinnerTargetRpm: rpm }),
  })),
);

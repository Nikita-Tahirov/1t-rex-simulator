import { useSyncExternalStore } from 'react';

export function createRafSampler<T>({
  sampleHz,
  getInitialSnapshot,
  sample,
}: {
  sampleHz: number;
  getInitialSnapshot: () => T;
  sample: (now: number) => T;
}) {
  const listeners = new Set<() => void>();
  let snapshot = getInitialSnapshot();
  let rafId = 0;
  let nextSampleAt = 0;

  function getSnapshot(): T {
    return snapshot;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (listeners.size === 1) start();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
  }

  function start(): void {
    snapshot = getInitialSnapshot();
    nextSampleAt = performance.now();
    const samplePeriodMs = 1000 / sampleHz;

    const tick = (now: number) => {
      if (listeners.size === 0) {
        rafId = 0;
        return;
      }

      if (now >= nextSampleAt) {
        snapshot = sample(now);
        for (const listener of listeners) listener();
        nextSampleAt = Math.max(nextSampleAt + samplePeriodMs, now - samplePeriodMs);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
  }

  function useStore(): T {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  return { useStore };
}

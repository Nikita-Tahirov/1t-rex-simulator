interface RuntimePerfStats {
  longAnimationFrames: number;
  maxLongAnimationFrameMs: number;
}

declare global {
  interface Window {
    __runtimePerf?: RuntimePerfStats;
  }
}

export function installPerformanceMonitor(): void {
  const stats: RuntimePerfStats = {
    longAnimationFrames: 0,
    maxLongAnimationFrameMs: 0,
  };
  window.__runtimePerf = stats;
  if (!('PerformanceObserver' in window)) return;
  if (!PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) return;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      stats.longAnimationFrames += 1;
      if (entry.duration > stats.maxLongAnimationFrameMs) {
        stats.maxLongAnimationFrameMs = entry.duration;
      }
    }
  });
  observer.observe({ type: 'long-animation-frame', buffered: true });
}

import { installPerformanceMonitor } from './performance-monitor.ts';

describe('performance monitor', () => {
  it('installs a runtime surface even when LoAF is unavailable', () => {
    delete window.__runtimePerf;

    installPerformanceMonitor();

    expect(window.__runtimePerf).toEqual({
      longAnimationFrames: 0,
      maxLongAnimationFrameMs: 0,
    });
  });
});

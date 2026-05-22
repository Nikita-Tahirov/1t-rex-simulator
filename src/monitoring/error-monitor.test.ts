import { captureError, installErrorMonitor } from './error-monitor.ts';

describe('error monitor', () => {
  beforeEach(() => {
    delete window.__errorEvents;
  });

  it('exposes captured errors for e2e and live smoke diagnostics', () => {
    installErrorMonitor();
    const before = window.__errorEvents?.length ?? 0;

    captureError(new Error('motor fault'), 'boundary', 'Stack');

    expect(window.__errorEvents?.at(-1)).toMatchObject({
      message: 'motor fault',
      source: 'boundary',
      componentStack: 'Stack',
    });
    expect(window.__errorEvents?.length).toBe(before + 1);
  });

  it('normalizes non-Error rejection payloads', () => {
    installErrorMonitor();

    captureError('plain failure', 'unhandledrejection');

    expect(window.__errorEvents?.at(-1)).toMatchObject({
      message: 'plain failure',
      source: 'unhandledrejection',
    });
  });
});

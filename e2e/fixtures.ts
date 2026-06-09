import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, runTest) => {
    const browserErrors: string[] = [];
    const browserWarnings: string[] = [];

    page.on('console', (message) => {
      const text = message.text().trim();
      if (message.type() === 'warning') {
        if (isIgnorableGpuDriverNoise(text)) return;
        browserWarnings.push(`console: ${text}`);
        return;
      }
      if (message.type() === 'error') {
        if (text === 'Failed to fetch') return;
        browserErrors.push(`console: ${text}`);
      }
    });

    page.on('pageerror', (error) => {
      browserErrors.push(`pageerror: ${error.message}`);
    });

    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText?.trim() ?? 'unknown';
      if (isIgnorableRequestFailure(failure)) return;
      browserErrors.push(`requestfailed: ${request.url()} (${failure})`);
    });

    await runTest(page);

    expect(browserWarnings).toEqual([]);
    expect(browserErrors).toEqual([]);
  },
});

export { expect };

function isIgnorableRequestFailure(errorText: string): boolean {
  return /ERR_ABORTED|NS_BINDING_ABORTED|aborted|canceled|cancelled/i.test(errorText);
}

// Локальные GPU-драйверы (ANGLE/Metal на macOS) шлют performance-advisory вида
// «GL Driver Message … GPU stall due to ReadPixels» при чтении пикселей сценой
// (SceneProbe). Это не предупреждение приложения, а шум окружения — на headless
// CI без GPU его нет. Фильтруем узко, чтобы не маскировать настоящие warning'и.
function isIgnorableGpuDriverNoise(text: string): boolean {
  return /GL Driver Message|GPU stall/i.test(text);
}

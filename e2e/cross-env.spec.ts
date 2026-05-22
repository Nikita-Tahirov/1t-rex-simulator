import { expect, test } from './fixtures.ts';
import { openSimulator } from './helpers/simulator.ts';

test('cross-environment smoke: scene, HUD and controls mount', async ({ page }) => {
  const started = Date.now();
  await openSimulator(page);
  await expect(page.getByRole('heading', { name: /1T-REX/i })).toBeVisible();
  await expect(page.getByLabel('Сценарий миссии')).toBeVisible();
  const canvasBox = await page.locator('canvas[data-engine^="three.js"]').boundingBox();
  expect(canvasBox?.width ?? 0).toBeGreaterThan(320);
  const runtime = await page.evaluate(() => {
    const w = window as Window & { __errorEvents?: unknown; __runtimePerf?: unknown };
    return {
      lang: document.documentElement.lang,
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
      hasErrorMonitor: Array.isArray(w.__errorEvents),
      hasPerfMonitor: typeof w.__runtimePerf === 'object',
      hasCamera: !!window.__cameraState,
      sceneReady: (window.__sceneRenderState?.meshCount ?? 0) > 20,
    };
  });
  expect(runtime).toEqual({
    lang: 'ru',
    manifest: '/manifest.webmanifest',
    hasErrorMonitor: true,
    hasPerfMonitor: true,
    hasCamera: true,
    sceneReady: true,
  });
  expect(Date.now() - started).toBeLessThan(12_000);
});

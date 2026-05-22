import performanceBudget from '../budgets/performance.json' with { type: 'json' };
import { expect, test } from './fixtures.ts';
import { openSimulator } from './helpers/simulator.ts';

const MIN_FPS = performanceBudget.runtime.minMeasuredFps;
const MIN_SOFTWARE_FPS = performanceBudget.runtime.minSoftwareRendererFps;

test('runtime FPS budget on default scene', async ({ page }) => {
  await openSimulator(page);
  const sample = await page.evaluate(
    () =>
      new Promise<{ fps: number; renderer: string }>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-engine^="three.js"]');
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
        const renderer =
          gl && debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : 'unknown';
        let frames = 0;
        const start = performance.now();
        function step(now: number) {
          frames += 1;
          if (now - start >= 2000) {
            resolve({ fps: (frames * 1000) / (now - start), renderer });
          } else {
            requestAnimationFrame(step);
          }
        }
        requestAnimationFrame(step);
      }),
  );
  const softwareRenderer = /swiftshader|software/i.test(sample.renderer);
  const minFps = softwareRenderer ? MIN_SOFTWARE_FPS : MIN_FPS;
  expect(sample.fps, `renderer=${sample.renderer}`).toBeGreaterThanOrEqual(minFps);
});

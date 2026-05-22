import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { ensureViteServer } from './ensure-vite-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const recordingDir = path.join(rootDir, 'docs', 'video', '_recording');
const baseURL = process.env.SIM_URL ?? 'http://127.0.0.1:5173/';
const channel = process.env.PLAYWRIGHT_CHANNEL;

const launchOptions = {
  headless: true,
  args: [
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
  ...(channel ? { channel } : {}),
};

const timeline = [
  { id: 'figureEight', mode: 'manual', camera: 'orbit', seconds: 12 },
  { id: 'obstacleAvoidance', mode: 'bt', camera: 'shoulder', seconds: 12 },
  { id: 'searchAndStrike', mode: 'fsm', camera: 'orbit', seconds: 12 },
  { id: 'spinnerImpact', mode: 'bt', camera: 'follow', seconds: 14, waitCompleted: true },
];

await fs.mkdir(recordingDir, { recursive: true });

const stopServer = await ensureViteServer({ rootDir, baseURL });
let browser;
let context;
let page;

try {
  browser = await chromium.launch(launchOptions);
  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: recordingDir, size: { width: 1280, height: 720 } },
  });
  page = await context.newPage();

  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!window.__telemetry && !!window.__scenarioStore && !!window.__simStore,
  );
  await page.waitForFunction(() => (window.__telemetry?.positionY ?? 0) !== 0);

  await page.evaluate(() => {
    window.__simStore?.getState().setMode('manual');
    window.__simStore?.getState().setCameraMode('orbit');
    window.__scenarioStore?.getState().setStatus('idle');
  });

  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await page.keyboard.down('d');
  await page.waitForTimeout(1200);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  await page.waitForTimeout(1200);

  for (const segment of timeline) {
    await page.evaluate(({ id, mode, camera }) => {
      window.__scenarioStore?.getState().setStatus('idle');
      window.__simStore?.getState().setMode(mode);
      window.__simStore?.getState().setCameraMode(camera);
      window.__scenarioStore?.getState().setCurrentScenarioId(id);
    }, segment);
    await page.waitForFunction(
      (id) =>
        window.__scenarioStore?.getState().currentScenarioId === id &&
        window.__scenarioRunner?.current?.scenario.id === id,
      segment.id,
    );
    await page.evaluate(() => {
      window.__scenarioStore?.getState().setStatus('running');
    });
    await page.waitForFunction(() => window.__scenarioStore?.getState().status === 'running');

    if (segment.waitCompleted) {
      await Promise.race([
        page.waitForFunction(() => window.__scenarioStore?.getState().status !== 'running', null, {
          timeout: segment.seconds * 1000,
        }),
        page.waitForTimeout(segment.seconds * 1000),
      ]).catch(() => undefined);
    } else {
      await page.waitForTimeout(segment.seconds * 1000);
    }
  }

  await page.evaluate(() => {
    window.__scenarioStore?.getState().setStatus('idle');
    window.__simStore?.getState().setMode('manual');
  });
  await page.waitForTimeout(1000);
} finally {
  const video = page?.video();
  await context?.close();
  await browser?.close();
  await stopServer();
  const videoPath = video ? await video.path() : null;
  if (videoPath) console.log(videoPath);
}

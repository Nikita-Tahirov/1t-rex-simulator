import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.SIM_E2E_PORT ?? 5174);
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`;
const chromiumGpuArgs =
  process.platform === 'win32'
    ? ['--use-angle=d3d11', '--ignore-gpu-blocklist']
    : ['--ignore-gpu-blocklist'];

// Параллелизм: 4 worker по умолчанию (≈ четверть от 16-ядерной машины),
// override через SIM_E2E_WORKERS. На CI достаточно 2, чтобы не выйти за лимит
// доступных GPU-контекстов под D3D11.
const defaultWorkers = process.env.CI ? 2 : 4;
const e2eWorkers = Number(process.env.SIM_E2E_WORKERS ?? defaultWorkers);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // fullyParallel: тесты в файлах БЕЗ `test.describe.configure({ mode: 'serial' })`
  // распределяются по worker'ам. drive.spec.ts и experiments.spec.ts уже помечены
  // serial из-за timing-чувствительности (shoulder-камера D, pose-driver vs scenario tick),
  // поэтому внутри них тесты остаются последовательными.
  fullyParallel: true,
  // retries=1: автопилотные сценарии (searchAndStrike/obstacleAvoidance) и
  // shoulder-камера D чувствительны к timing pose-driver vs scenario tick;
  // одна повторная попытка устраняет редкий flake без сокрытия настоящих
  // регрессий (детерминированные unit-тесты в src/scenarios/*.test.ts).
  retries: 1,
  workers: e2eWorkers,
  reporter: 'list',
  use: {
    baseURL: e2eBaseURL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: [
        ...chromiumGpuArgs,
        '--disable-frame-rate-limit',
        '--disable-gpu-vsync',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
      ],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      testMatch: /cross-env\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'firefox-smoke',
      testMatch: /cross-env\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-smoke',
      testMatch: /cross-env\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});

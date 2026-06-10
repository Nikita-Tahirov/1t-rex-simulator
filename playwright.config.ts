import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.SIM_E2E_PORT ?? 5174);
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`;
// Windows локально имеет аппаратный D3D11; ubuntu/macOS на CI работают без GPU,
// поэтому Chromium принудительно идёт на SwiftShader (Mesa software OpenGL).
// Без `--use-gl=swiftshader` headless Chromium на ubuntu-latest не создаёт
// WebGL context, Three.js не монтирует сцену, и все e2e падают на ожидании
// `window.__sceneRenderState?.meshCount > 20` (проверено 2026-05-22).
const chromiumGpuArgs =
  process.platform === 'win32'
    ? ['--use-angle=d3d11', '--ignore-gpu-blocklist']
    : ['--use-gl=swiftshader', '--ignore-gpu-blocklist'];

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
        // Перекрытые окна (вторая вкладка мультиплеер-e2e) не должны троттлиться:
        // иначе фоновая вкладка публикует позы ~1 Гц и интерполяция «замерзает».
        '--disable-backgrounding-occluded-windows',
      ],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    // E2E всегда детерминированный in-memory транспорт: дефолтный публичный
    // Firebase-config иначе увёл бы netgame-спеки в реальный prod-RTDB
    // (недетерминизм + засорение БД). Vite пробрасывает process.env VITE_*.
    env: { VITE_NET_ADAPTER: 'memory' },
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

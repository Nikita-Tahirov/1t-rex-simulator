import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.SIM_E2E_PORT ?? 5174);
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`;
// Windows локально имеет аппаратный D3D11, macOS локально — аппаратный Metal
// через ANGLE; ubuntu/CI работают без GPU, поэтому там Chromium принудительно
// идёт на SwiftShader (Mesa software OpenGL). Без `--use-gl=swiftshader`
// headless Chromium на ubuntu-latest не создаёт WebGL context, Three.js не
// монтирует сцену, и все e2e падают на ожидании
// `window.__sceneRenderState?.meshCount > 20` (проверено 2026-05-22).
// На локальном Apple Silicon SwiftShader, наоборот, вреден: софтверный рендер
// physics-heavy сцены даёт 0 КАДР/С и таймауты collision/experiments e2e
// (проверено 2026-06-11 на M4).
const chromiumGpuArgs =
  process.platform === 'win32'
    ? ['--use-angle=d3d11', '--ignore-gpu-blocklist']
    : process.platform === 'darwin' && !process.env.CI
      ? ['--use-angle=metal', '--ignore-gpu-blocklist']
      : ['--use-gl=swiftshader', '--ignore-gpu-blocklist'];

// Параллелизм: 4 worker по умолчанию на референсной 16-поточной машине
// (i7-11800H), override через SIM_E2E_WORKERS. На CI достаточно 2, чтобы не
// выйти за лимит доступных GPU-контекстов под D3D11. На локальном Apple
// Silicon (M4, 10 ядер) 4 параллельных Chromium с физикой+WebGL перегружают
// машину (таймауты waitForScenarioRunner); 2 — sweet spot (2026-06-11:
// workers=4 → 2 failed/5 flaky, workers=2 → полностью зелёный, 6.0m).
const defaultWorkers = process.env.CI || process.platform === 'darwin' ? 2 : 4;
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

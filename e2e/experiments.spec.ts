import { expect, test } from './fixtures.ts';
import {
  openSimulator,
  runScenarioRealtime,
  runScenarioToVerification,
  verificationRuns,
} from './helpers/simulator.ts';

const SLOW_VERIFICATION_RUNS = new Set([
  'obstacleAvoidance',
  'searchAndStrike',
  'spinnerImpact',
  'fsmVsBt',
  'figureEight',
  'madgwickVsComplementary',
  'brownoutDischarge',
]);

test.describe.configure({ mode: 'serial' });

test.describe('1T-REX Sim — автопилот сценариев', () => {
  test('optgroup группирует базовые миссии и эксперименты', async ({ page }) => {
    await openSimulator(page);
    const select = page.getByLabel('Сценарий миссии');
    await expect(select).toBeVisible();
    const groupLabels = await select
      .locator('optgroup')
      .evaluateAll((els) => els.map((e) => (e as HTMLOptGroupElement).label));
    expect(groupLabels).toContain('Базовые миссии');
    expect(groupLabels).toContain('Сравнительные эксперименты');
  });

  test('все 7 сценариев присутствуют в списке', async ({ page }) => {
    await openSimulator(page);
    const values = await page
      .getByLabel('Сценарий миссии')
      .locator('option')
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    expect(values).toEqual([
      'figureEight',
      'obstacleAvoidance',
      'searchAndStrike',
      'spinnerImpact',
      'madgwickVsComplementary',
      'fsmVsBt',
      'brownoutDischarge',
    ]);
  });

  test('без сценария: pilotInput.active = false', async ({ page }) => {
    await openSimulator(page);
    const active = await page.evaluate(
      () => window.__scenarioStore?.getState().pilotInput.active ?? true,
    );
    expect(active).toBe(false);
  });

  test('figureEight: автопилот двигает робота', async ({ page }) => {
    test.setTimeout(60_000);
    await openSimulator(page);
    const res = await runScenarioRealtime(page, 'figureEight', 5);
    expect(res.pilotActive).toBe(true);
    expect(Math.max(res.distance, res.pathLength)).toBeGreaterThan(0.3);
  });

  test('obstacleAvoidance: автопилот двигает робота к финишу +X', async ({ page }) => {
    test.setTimeout(60_000);
    await openSimulator(page);
    const res = await runScenarioRealtime(page, 'obstacleAvoidance', 2);
    expect(res.pilotActive).toBe(true);
    expect(Math.max(res.distance, res.pathLength)).toBeGreaterThan(0.15);
  });

  test('searchAndStrike: автопилот наводится на цель', async ({ page }) => {
    test.setTimeout(60_000);
    await openSimulator(page);
    const res = await runScenarioRealtime(page, 'searchAndStrike', 2);
    expect(res.pilotActive).toBe(true);
    expect(Math.max(res.distance, res.pathLength, res.yawRate)).toBeGreaterThan(0.15);
  });

  test('spinnerImpact: робот раскручивает ротор и идёт на бронепанель', async ({ page }) => {
    test.setTimeout(60_000);
    await openSimulator(page);
    const res = await runScenarioRealtime(page, 'spinnerImpact', 4);
    expect(res.pilotActive).toBe(true);
    const spinnerRpm = await page.evaluate(() => Math.abs(window.__telemetry?.spinnerRpm ?? 0));
    expect(spinnerRpm).toBeGreaterThan(1500);
    expect(Math.max(res.distance, res.pathLength)).toBeGreaterThan(0.2);
  });

  test('madgwickVsComplementary: автопилот выполняет программу yaw', async ({ page }) => {
    test.setTimeout(60_000);
    await openSimulator(page);
    const res = await runScenarioRealtime(page, 'madgwickVsComplementary', 6);
    expect(res.pilotActive).toBe(true);
    expect(res.speed).toBeGreaterThan(0);
  });

  test('fsmVsBt (BT): автопилот ведёт робота через дерево поведения', async ({ page }) => {
    test.setTimeout(60_000);
    await openSimulator(page);
    await page.evaluate(() => window.__simStore?.getState().setMode('bt'));
    const res = await runScenarioRealtime(page, 'fsmVsBt', 2);
    expect(res.pilotActive).toBe(true);
    expect(Math.max(res.distance, res.pathLength, res.yawRate)).toBeGreaterThan(0.1);
    await page.evaluate(() => window.__simStore?.getState().setMode('manual'));
  });

  test('fsmVsBt (FSM): автопилот ведёт робота через конечный автомат', async ({ page }) => {
    test.setTimeout(60_000);
    await openSimulator(page);
    await page.evaluate(() => window.__simStore?.getState().setMode('fsm'));
    const res = await runScenarioRealtime(page, 'fsmVsBt', 2);
    expect(res.pilotActive).toBe(true);
    expect(Math.max(res.distance, res.pathLength, res.yawRate)).toBeGreaterThan(0.1);
    await page.evaluate(() => window.__simStore?.getState().setMode('manual'));
  });

  test('brownoutDischarge: автопилот жмёт W → робот ускоряется', async ({ page }) => {
    test.setTimeout(60_000);
    await openSimulator(page);
    const res = await runScenarioRealtime(page, 'brownoutDischarge', 5);
    expect(res.pilotActive).toBe(true);
    expect(res.speed).toBeGreaterThan(0.5);
    expect(Math.max(res.distance, res.pathLength)).toBeGreaterThan(0.5);
  });

  test('интерфейс отображает блок «Итог эксперимента»', async ({ page }) => {
    await openSimulator(page);
    await page.evaluate(() => {
      window.__scenarioStore?.getState().setStatus('idle');
      window.__scenarioStore?.getState().setCurrentScenarioId('madgwickVsComplementary');
      window.__scenarioStore?.getState().setSummary({ kpi_demo: 1.234, kpi_other: 5 });
    });
    await expect(page.getByText('Итог эксперимента')).toBeVisible();
    await expect(page.getByText('kpi_demo')).toBeVisible();
    await expect(page.getByText('1.234', { exact: true })).toBeVisible();
  });

  for (const run of verificationRuns) {
    const label = run.mode ? `${run.id}:${run.mode}` : run.id;
    const details = SLOW_VERIFICATION_RUNS.has(run.id) ? { tag: '@scenario-slow' } : {};
    test(`проверочный шлюз: ${label}`, details, async ({ page }) => {
      test.setTimeout(run.timeoutMs + 30_000);
      await page.setViewportSize({ width: 640, height: 480 });
      await openSimulator(page);

      const result = await runScenarioToVerification(page, run);
      expect(
        result.passed,
        `${result.label} verification failed:\n${JSON.stringify(result, null, 2)}`,
      ).toBe(true);
    });
  }
});

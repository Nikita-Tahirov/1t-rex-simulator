import { SHREDDER_CENTER } from '../src/physics/arena/arenaData.ts';
import { expect, test } from './fixtures.ts';
import { openSimulator, setKey } from './helpers/simulator.ts';

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.__shredderRotor?.setAngleOverride(null));
});

test('шредер пускает корпус в геометрический промежуток между лопастями', async ({ page }) => {
  await openSimulator(page);
  await page.evaluate(([x, z]) => {
    window.__shredderRotor?.setAngleOverride(Math.PI / 4);
    window.__scenarioStore?.getState().setStatus('idle');
    window.__simStore?.getState().setMode('manual');
    window.__scenarioStore?.getState().requestRobotReset({ x, z: z + 2.1, yaw: -Math.PI / 2 });
  }, SHREDDER_CENTER);
  await page.waitForTimeout(300);

  await setKey(page, 'KeyW', true);
  try {
    await page.waitForTimeout(1800);
  } finally {
    await setKey(page, 'KeyW', false);
  }

  const z = await page.evaluate(() => window.__telemetry.positionZ);
  expect(z).toBeLessThan(SHREDDER_CENTER[1] + 1.25);
});

test('текущая лопасть шредера проталкивает корпус и наносит урон', async ({ page }) => {
  const requestedZ = SHREDDER_CENTER[1] - 0.52;
  await openSimulator(page);
  await page.evaluate(([x, z]) => {
    window.__shredderRotor?.setAngleOverride(0);
    window.__scenarioStore?.getState().setStatus('idle');
    window.__simStore?.getState().setMode('manual');
    window.__scenarioStore?.getState().requestRobotReset({ x: x + 0.95, z: z - 0.52, yaw: 0 });
  }, SHREDDER_CENTER);
  await page.waitForTimeout(300);

  const state = await page.evaluate(() => ({
    z: window.__telemetry.positionZ,
    health: window.__telemetry.robotHealth,
    source: window.__telemetry.robotDamageLastSource,
    energy: window.__telemetry.robotDamageLastEnergyJ,
  }));

  expect(state.z).toBeLessThan(requestedZ - 0.03);
  expect(state.health).toBeLessThan(1000);
  expect(state.source).toBe('shredder');
  expect(state.energy).toBeGreaterThan(0);
});

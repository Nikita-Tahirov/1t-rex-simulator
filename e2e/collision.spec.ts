import { expect, test } from './fixtures.ts';
import { openSimulator, setKey, waitForScenarioRunner } from './helpers/simulator.ts';

const RIGHT_FIGURE_CONE_X = 1.85;
const CONE_RADIUS = 0.15;
const CHASSIS_HALF_X = 0.47;
const CONTACT_TOLERANCE_M = 0.08;
const ROTATION_BLOCK_YAW_LIMIT_RAD = 1.25;
const ROTATION_BLOCK_YAW_RATE_LIMIT = 0.1;
const WHEEL_BLOCKED_OMEGA_LIMIT = 1;
type WheelTelemetry = { wheelOmega: number[]; wheelOmegaTarget: number[] };

test('fixed scenario obstacles block the kinematic chassis', async ({ page }) => {
  await openSimulator(page);
  await page.evaluate(() => {
    window.__scenarioStore?.getState().setStatus('idle');
    window.__simStore?.getState().setMode('manual');
    window.__scenarioStore?.getState().setCurrentScenarioId('figureEight');
  });
  await waitForScenarioRunner(page, 'figureEight');
  await page.evaluate(() => {
    window.__scenarioStore?.getState().requestRobotReset({ x: 0.9, z: 0, yaw: 0 });
  });
  await page.waitForTimeout(300);

  await setKey(page, 'KeyW', true);
  try {
    await page.waitForTimeout(1800);
  } finally {
    await setKey(page, 'KeyW', false);
  }

  const x = await page.evaluate(() => window.__telemetry.positionX);
  expect(x).toBeGreaterThan(1.05);
  expect(x).toBeLessThan(RIGHT_FIGURE_CONE_X - CONE_RADIUS - CHASSIS_HALF_X + CONTACT_TOLERANCE_M);
});

test('fixed scenario obstacle impact damages the robot', async ({ page }) => {
  await openSimulator(page);
  await page.evaluate(() => {
    window.__scenarioStore?.getState().setStatus('idle');
    window.__simStore?.getState().setMode('manual');
    window.__scenarioStore?.getState().setCurrentScenarioId('figureEight');
  });
  await waitForScenarioRunner(page, 'figureEight');
  await page.evaluate(() => {
    window.__scenarioStore?.getState().requestRobotReset({ x: 0.9, z: 0, yaw: 0 });
  });
  await page.waitForTimeout(300);

  await setKey(page, 'KeyW', true);
  try {
    await page.waitForTimeout(1800);
  } finally {
    await setKey(page, 'KeyW', false);
  }

  const damage = await page.evaluate(() => ({
    health: window.__telemetry.robotHealth,
    source: window.__telemetry.robotDamageLastSource,
    energy: window.__telemetry.robotDamageLastEnergyJ,
  }));
  expect(damage.health).toBeLessThan(1000);
  expect(damage.source).toBe('impact');
  expect(damage.energy).toBeGreaterThan(90);
});

test('arena wall impact damages the robot', async ({ page }) => {
  await openSimulator(page);
  await page.evaluate(() => {
    window.__scenarioStore?.getState().setStatus('idle');
    window.__simStore?.getState().setMode('manual');
    window.__scenarioStore?.getState().requestRobotReset({ x: 7.65, z: 0, yaw: 0 });
  });
  await page.waitForTimeout(300);

  await setKey(page, 'KeyW', true);
  try {
    await expect
      .poll(() => page.evaluate(() => window.__telemetry.robotHealth), { timeout: 5000 })
      .toBeLessThan(1000);
  } finally {
    await setKey(page, 'KeyW', false);
  }

  const damage = await page.evaluate(() => ({
    health: window.__telemetry.robotHealth,
    source: window.__telemetry.robotDamageLastSource,
  }));
  expect(damage.source).toBe('impact');
});

test('wheel visual speed follows actual chassis motion, not held throttle', async ({ page }) => {
  await openSimulator(page);
  await page.evaluate(() => {
    window.__scenarioStore?.getState().setStatus('idle');
    window.__simStore?.getState().setMode('manual');
    window.__scenarioStore?.getState().setCurrentScenarioId('figureEight');
  });
  await waitForScenarioRunner(page, 'figureEight');
  await page.evaluate(() => {
    window.__scenarioStore?.getState().requestRobotReset({ x: 0.9, z: 0, yaw: 0 });
  });
  await page.waitForTimeout(300);

  await setKey(page, 'KeyW', true);
  try {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const telemetry = window.__telemetry as typeof window.__telemetry & WheelTelemetry;
            return Math.max(...telemetry.wheelOmega.map(Math.abs));
          }),
        { timeout: 5000 },
      )
      .toBeGreaterThan(5);
    await expect
      .poll(() => page.evaluate(() => window.__telemetry.speed), { timeout: 8000 })
      .toBeLessThan(0.05);

    const blocked = await page.evaluate(() => {
      const telemetry = window.__telemetry as typeof window.__telemetry & WheelTelemetry;
      return {
        actualWheelOmega: Math.max(...telemetry.wheelOmega.map(Math.abs)),
        targetWheelOmega: Math.max(...telemetry.wheelOmegaTarget.map(Math.abs)),
      };
    });
    expect(blocked.targetWheelOmega).toBeGreaterThan(5);
    expect(blocked.actualWheelOmega).toBeLessThan(WHEEL_BLOCKED_OMEGA_LIMIT);
  } finally {
    await setKey(page, 'KeyW', false);
  }
});

test('fixed scenario obstacles block in-place chassis rotation', async ({ page }) => {
  await openSimulator(page);
  await page.evaluate(() => {
    window.__scenarioStore?.getState().setStatus('idle');
    window.__simStore?.getState().setMode('manual');
    window.__scenarioStore?.getState().setCurrentScenarioId('figureEight');
  });
  await waitForScenarioRunner(page, 'figureEight');
  await page.evaluate(() => {
    window.__scenarioStore?.getState().requestRobotReset({ x: 1.85, z: 0.57, yaw: 0 });
  });
  await page.waitForTimeout(300);

  const startYaw = await page.evaluate(() => window.__telemetry.yaw);
  await setKey(page, 'KeyD', true);
  try {
    await page.waitForTimeout(1800);
  } finally {
    await setKey(page, 'KeyD', false);
  }

  const { endYaw, yawRate } = await page.evaluate(() => ({
    endYaw: window.__telemetry.yaw,
    yawRate: window.__telemetry.yawRate,
  }));
  const yawDelta = Math.atan2(Math.sin(endYaw - startYaw), Math.cos(endYaw - startYaw));
  expect(Math.abs(yawDelta)).toBeLessThan(ROTATION_BLOCK_YAW_LIMIT_RAD);
  expect(Math.abs(yawRate)).toBeLessThan(ROTATION_BLOCK_YAW_RATE_LIMIT);
});

import { expect, test } from './fixtures.ts';
import { openSimulator, setKey } from './helpers/simulator.ts';

test.describe('1T-REX Sim — ручное владение командами', () => {
  test('ArrowRight даёт правый yaw как дубль D-клавиши', async ({ page }) => {
    await openSimulator(page);
    await setKey(page, 'ArrowRight', true);
    try {
      await expect
        .poll(() => page.evaluate(() => window.__telemetry.yawRate), { timeout: 5000 })
        .toBeGreaterThan(0.4);
    } finally {
      await setKey(page, 'ArrowRight', false);
    }
  });

  test('ручной idle сбрасывает зависший pilotInput перед D-клавишей', async ({ page }) => {
    await openSimulator(page);
    await page.evaluate(() => {
      const store = window.__scenarioStore?.getState();
      store?.setPilotInput({ active: true, throttle: 0, turn: 0, brake: 0 });
      store?.setCommandSource('scenario');
      store?.setStatus('idle');
      window.__simStore?.getState().setMode('manual');
    });
    await expect
      .poll(() => page.evaluate(() => window.__scenarioStore?.getState().pilotInput.active))
      .toBe(false);
    await expect
      .poll(() => page.evaluate(() => window.__scenarioStore?.getState().commandSource))
      .toBe('keyboard');

    await setKey(page, 'KeyD', true);
    try {
      await expect
        .poll(() => page.evaluate(() => window.__telemetry.yawRate), { timeout: 5000 })
        .toBeGreaterThan(0.4);
    } finally {
      await setKey(page, 'KeyD', false);
    }
  });

  test('кнопка Ручной забирает управление у активного pilotInput', async ({ page }) => {
    await openSimulator(page);
    await page.evaluate(() => {
      const store = window.__scenarioStore?.getState();
      store?.setPilotInput({ active: true, throttle: 0, turn: 0, brake: 0 });
      store?.setCommandSource('scenario');
    });

    await page.getByRole('button', { name: 'Ручной' }).click();
    await expect
      .poll(() => page.evaluate(() => window.__scenarioStore?.getState().commandSource))
      .toBe('keyboard');

    await setKey(page, 'KeyD', true);
    try {
      await expect
        .poll(() => page.evaluate(() => window.__telemetry.yawRate), { timeout: 5000 })
        .toBeGreaterThan(0.4);
    } finally {
      await setKey(page, 'KeyD', false);
    }
  });
});

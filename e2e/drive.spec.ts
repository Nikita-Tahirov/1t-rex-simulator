import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures.ts';
import { openSimulator, setKey } from './helpers/simulator.ts';

test.describe.configure({ mode: 'serial' });
test.describe('1T-REX Sim — ручное управление', () => {
  test('загружается и экспонирует telemetry', async ({ page }) => {
    await openSimulator(page);
    const has = await page.evaluate(() => typeof window.__telemetry === 'object');
    expect(has).toBe(true);
  });

  test('панель индикации даёт доступный выбор сценария', async ({ page }) => {
    await openSimulator(page);
    await expect(page.getByLabel('Сценарий миссии')).toBeVisible();
  });

  test('панель индикации проходит автоматический axe-аудит WCAG', async ({ page }) => {
    await openSimulator(page);

    const results = await new AxeBuilder({ page })
      .include('aside')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('режим камеры Спина ставит камеру близко за роботом', async ({ page }) => {
    await openSimulator(page);
    await page.getByRole('button', { name: 'Режим камеры: Спина' }).click();

    await expect
      .poll(() => page.evaluate(() => window.__cameraState?.mode ?? null), { timeout: 5000 })
      .toBe('shoulder');

    const state = await page.evaluate(() => window.__cameraState);
    expect(state?.y).toBeLessThan(1.5);
    expect(state?.y).toBeGreaterThan(0.8);
    const distance = await page.evaluate(() =>
      Math.hypot(
        window.__cameraState!.x - window.__telemetry.positionX,
        window.__cameraState!.z - window.__telemetry.positionZ,
      ),
    );
    expect(distance).toBeGreaterThan(1.2);
    expect(distance).toBeLessThan(2.2);
    const lateralOffset = await page.evaluate(() => {
      const camera = window.__cameraState!;
      const telemetry = window.__telemetry;
      const dx = camera.x - telemetry.positionX;
      const dz = camera.z - telemetry.positionZ;
      const rightX = -Math.sin(telemetry.yaw);
      const rightZ = Math.cos(telemetry.yaw);
      return Math.abs(dx * rightX + dz * rightZ);
    });
    expect(lateralOffset).toBeLessThan(0.25);
  });

  test('камера Спина поворачивается вместе с роботом при развороте на месте', async ({ page }) => {
    await openSimulator(page);
    await page.getByRole('button', { name: 'Режим камеры: Спина' }).click();

    await expect
      .poll(() => page.evaluate(() => window.__cameraState?.mode), { timeout: 5000 })
      .toBe('shoulder');

    const startBearing = await page.evaluate(() => {
      const camera = window.__cameraState!;
      const telemetry = window.__telemetry;
      return Math.atan2(camera.z - telemetry.positionZ, camera.x - telemetry.positionX);
    });

    await setKey(page, 'KeyD', true);
    try {
      await expect
        .poll(() => page.evaluate(() => Math.abs(window.__telemetry.yawRate)), { timeout: 5000 })
        .toBeGreaterThan(0.4);

      await expect
        .poll(
          () =>
            page.evaluate((startBearing) => {
              const camera = window.__cameraState!;
              const telemetry = window.__telemetry;
              const bearing = Math.atan2(
                camera.z - telemetry.positionZ,
                camera.x - telemetry.positionX,
              );
              let delta = bearing - startBearing;
              while (delta > Math.PI) delta -= 2 * Math.PI;
              while (delta < -Math.PI) delta += 2 * Math.PI;
              return Math.abs(delta);
            }, startBearing),
          { timeout: 5000 },
        )
        .toBeGreaterThan(0.35);
    } finally {
      await setKey(page, 'KeyD', false);
    }
  });

  test('W-клавиша разгоняет робота вперёд', async ({ page }) => {
    await openSimulator(page);
    const startX = await page.evaluate(() => window.__telemetry.positionX);
    const startZ = await page.evaluate(() => window.__telemetry.positionZ);
    await setKey(page, 'KeyW', true);

    try {
      await expect
        .poll(() => page.evaluate(() => window.__telemetry.speed), { timeout: 5000 })
        .toBeGreaterThan(0.8);

      await expect
        .poll(
          () =>
            page.evaluate(
              ({ startX, startZ }) =>
                Math.hypot(
                  window.__telemetry.positionX - startX,
                  window.__telemetry.positionZ - startZ,
                ),
              { startX, startZ },
            ),
          { timeout: 5000 },
        )
        .toBeGreaterThan(0.25);
    } finally {
      await setKey(page, 'KeyW', false);
    }
  });

  test('Питание реагирует на ходовые моторы и спиннер', async ({ page }) => {
    await openSimulator(page);
    const startSoc = await page.evaluate(() => window.__telemetry.batterySoc);
    await setKey(page, 'KeyW', true);
    await setKey(page, 'KeyR', true);

    try {
      await expect
        .poll(() => page.evaluate(() => window.__telemetry.batteryCurrent), { timeout: 5000 })
        .toBeGreaterThan(20);

      await expect
        .poll(
          () =>
            page.evaluate(
              () => window.__telemetry.batteryVoltageOpen - window.__telemetry.batteryVoltageLoad,
            ),
          { timeout: 5000 },
        )
        .toBeGreaterThan(1);

      await expect
        .poll(() => page.evaluate(() => window.__telemetry.batterySoc), { timeout: 5000 })
        .toBeLessThan(startSoc);
    } finally {
      await setKey(page, 'KeyW', false);
      await setKey(page, 'KeyR', false);
    }
  });

  test('D-клавиша даёт ненулевую угловую скорость', async ({ page }) => {
    await openSimulator(page);
    await expect
      .poll(() => page.evaluate(() => window.__scenarioStore?.getState().pilotInput.active))
      .toBe(false);
    await setKey(page, 'KeyD', true);

    try {
      await expect
        .poll(() => page.evaluate(() => Math.abs(window.__telemetry.yawRate)), { timeout: 5000 })
        .toBeGreaterThan(0.4);
    } finally {
      await setKey(page, 'KeyD', false);
    }
  });

  // Signed direction-of-rotation regression: D = +yaw (turn right, +X→+Z),
  // A = -yaw (turn left, +X→-Z); yawRate имеет тот же знак, что d/dt(yaw).
  test('D-клавиша: yawRate положителен по принятому соглашению', async ({ page }) => {
    await openSimulator(page);
    await setKey(page, 'KeyD', true);
    try {
      await expect
        .poll(() => page.evaluate(() => window.__telemetry.yawRate), { timeout: 5000 })
        .toBeGreaterThan(0.4);
    } finally {
      await setKey(page, 'KeyD', false);
    }
  });

  test('A-клавиша: yawRate отрицателен по принятому соглашению', async ({ page }) => {
    await openSimulator(page);
    await setKey(page, 'KeyA', true);
    try {
      await expect
        .poll(() => page.evaluate(() => window.__telemetry.yawRate), { timeout: 5000 })
        .toBeLessThan(-0.4);
    } finally {
      await setKey(page, 'KeyA', false);
    }
  });

  test('D-клавиша: yaw УВЕЛИЧИВАЕТСЯ (forward rotates +X → +Z)', async ({ page }) => {
    await openSimulator(page);
    const startYaw = await page.evaluate(() => window.__telemetry.yaw);
    await setKey(page, 'KeyD', true);
    try {
      await expect
        .poll(() => page.evaluate((s) => window.__telemetry.yaw - s, startYaw), { timeout: 5000 })
        .toBeGreaterThan(0.3);
    } finally {
      await setKey(page, 'KeyD', false);
    }
  });

  test('A-клавиша: yaw УМЕНЬШАЕТСЯ (forward rotates +X → −Z)', async ({ page }) => {
    await openSimulator(page);
    const startYaw = await page.evaluate(() => window.__telemetry.yaw);
    await setKey(page, 'KeyA', true);
    try {
      await expect
        .poll(() => page.evaluate((s) => window.__telemetry.yaw - s, startYaw), { timeout: 5000 })
        .toBeLessThan(-0.3);
    } finally {
      await setKey(page, 'KeyA', false);
    }
  });

  // Камера shoulder: robot facing +X, D → +yaw → cam_z = -sin(α)·back. Через
  // 900 мс под асимметричным τ=0.15с (ramp в Robot.tsx) + half-life 0.12с
  // (smoothYaw в FollowCamera) ожидаем cam_z < -0.3.
  test('Камера Спина: D смещает камеру в -Z в первые 0.9 с разворота', async ({ page }) => {
    await openSimulator(page);
    await page.getByRole('button', { name: 'Режим камеры: Спина' }).click();
    await expect
      .poll(() => page.evaluate(() => window.__cameraState?.mode), { timeout: 5000 })
      .toBe('shoulder');
    await setKey(page, 'KeyD', true);
    try {
      await expect
        .poll(() => page.evaluate(() => window.__cameraState?.z ?? 0), { timeout: 3000 })
        .toBeLessThan(-0.3);
    } finally {
      await setKey(page, 'KeyD', false);
    }
  });

  // Regression: «невидимая стенка» на въезде на мост. Wedge ConvexHull
  // тормозил forward через push-back; снято переходом chassis на
  // kinematicPosition (см. Robot.tsx). Маршрут: пол → sector entry ramp →
  // landing pad → bridge ramp → deck (Y=0.6). Старт: x=1.5, z=4.5, yaw=0
  // (BRIDGE_LANDING_WEST_X = ZONE_CENTERS.D.x - 2.35 = 2.15).
  test('робот заезжает на bridge deck без «невидимой стенки»', async ({ page }) => {
    await openSimulator(page);
    await page.evaluate(() => {
      window.__scenarioStore?.getState().requestRobotReset({ x: 1.5, z: 4.5, yaw: 0 });
    });
    await page.waitForTimeout(300);
    await setKey(page, 'KeyW', true);
    try {
      // Y > 0.5: chassis выше середины bridge ramp (ramp slope 0.07→0.6,
      // chassisY ≈ 0.5 на верхних 60 % рампы). При исходном баге wedge
      // ConvexHull тормозил forward, Y оставался ~0.07 (на landing pad).
      await expect
        .poll(() => page.evaluate(() => window.__telemetry?.positionY ?? 0), { timeout: 8000 })
        .toBeGreaterThan(0.5);
    } finally {
      await setKey(page, 'KeyW', false);
    }
    // X > 3.0: робот доехал минимум до второй половины bridge ramp
    // (BRIDGE_LANDING_WEST_X = 2.15, ramp_high_X = BRIDGE_DECK_WEST_X = 3.7).
    await expect
      .poll(() => page.evaluate(() => window.__telemetry?.positionX ?? 0), { timeout: 3000 })
      .toBeGreaterThan(3.0);
  });

  test('Отпуск клавиши останавливает робота (демпфирование)', async ({ page }) => {
    await openSimulator(page);
    await setKey(page, 'KeyW', true);

    try {
      await expect
        .poll(() => page.evaluate(() => window.__telemetry.speed), { timeout: 5000 })
        .toBeGreaterThan(0.8);
    } finally {
      await setKey(page, 'KeyW', false);
    }

    await expect
      .poll(() => page.evaluate(() => window.__telemetry.speed), { timeout: 5000 })
      .toBeLessThan(0.6);
  });
});

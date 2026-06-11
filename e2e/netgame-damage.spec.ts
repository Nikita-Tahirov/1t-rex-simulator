import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { openSimulator } from './helpers/simulator.ts';

/**
 * Регрессия боевого урона и шкал здоровья (in-memory адаптер, две вкладки):
 * роботы под автопилотом сходятся и бьются (гость — со спиннером), и тест
 * доказывает, что (1) урон реально наносится — здоровье жертвы падает;
 * (2) шкала соперника на ЧУЖОМ экране достоверна — совпадает со
 * self-authoritative здоровьем жертвы; (3) числовые HP в HUD обновляются.
 *
 * Появился после жалобы «бой идёт, а шкалы стоят»: контактный таран ловил
 * только редкие пики силы >700 Н, типичные удары не регистрировались.
 */

async function enterNet(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Сетевой бой' }).click();
  await page.getByLabel('Ваше имя').fill(name);
  await page.getByRole('button', { name: 'К списку комнат' }).click();
}

/**
 * Автопилот изнутри страницы: каждые 150 мс рулит на соперника (W + A/D) и
 * опционально крутит спиннер (R). Синтетический keydown переживает blur-сброс
 * useKeyboard при переключении вкладок (обе вкладки активны одновременно).
 */
async function autopilot(page: Page, spinner: boolean): Promise<void> {
  await page.evaluate((spin) => {
    const w = window as unknown as {
      __telemetry?: { positionX: number; positionZ: number; yaw: number };
      __netRoomStore?: {
        getState: () => {
          uid: string | null;
          room: { states: Record<string, { x: number; z: number }> } | null;
        };
      };
    };
    const down = (code: string) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    const up = (code: string) =>
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    window.setInterval(() => {
      const t = w.__telemetry;
      const s = w.__netRoomStore?.getState();
      if (!t || !s?.room || !s.uid) return;
      let targetX = 0;
      let targetZ = 0;
      let found = false;
      for (const [uid, st] of Object.entries(s.room.states)) {
        if (uid !== s.uid) {
          targetX = st.x;
          targetZ = st.z;
          found = true;
          break;
        }
      }
      if (!found) return;
      const targetYaw = Math.atan2(targetZ - t.positionZ, targetX - t.positionX);
      let err = targetYaw - t.yaw;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      down('KeyW');
      if (spin) down('KeyR');
      if (err > 0.12) {
        up('KeyA');
        down('KeyD');
      } else if (err < -0.12) {
        up('KeyD');
        down('KeyA');
      } else {
        up('KeyA');
        up('KeyD');
      }
    }, 150);
  }, spinner);
}

function readSelfHealth(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __telemetry?: { robotHealth: number } }).__telemetry?.robotHealth ??
      -1,
  );
}

/** Здоровье игрока `uid` в снапшоте комнаты этой вкладки (как видит её HUD). */
function readRoomHealth(page: Page, uid: string): Promise<number> {
  return page.evaluate(
    (target) =>
      (
        window as unknown as {
          __netRoomStore?: {
            getState: () => { room: { states: Record<string, { health: number }> } | null };
          };
        }
      ).__netRoomStore?.getState().room?.states[target]?.health ?? -1,
    uid,
  );
}

function readUid(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __netRoomStore?: { getState: () => { uid: string | null } } }
      ).__netRoomStore?.getState().uid ?? null,
  );
}

test('бой наносит урон: шкалы и числа HP падают на обоих экранах', { tag: '@netgame' }, async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await openSimulator(page);
  await enterNet(page, 'Хост');
  await page.getByLabel('Название комнаты').fill('УронРегрессия');
  await page.getByRole('button', { name: 'Создать комнату' }).click();

  const guest = await context.newPage();
  await guest.goto('/');
  await enterNet(guest, 'Гость');
  await expect(guest.getByText('УронРегрессия')).toBeVisible();
  await guest.getByRole('button', { name: 'Войти' }).click();

  await page.getByRole('button', { name: 'Я готов' }).click();
  await guest.getByRole('button', { name: 'Я готов' }).click();
  const startButton = page.getByRole('button', { name: 'Начать бой' });
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(page.getByTestId('surrender')).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByTestId('surrender')).toBeVisible({ timeout: 20_000 });

  const hostUid = await readUid(page);
  expect(hostUid).not.toBeNull();

  // Дать обратному отсчёту закончиться, затем включить автопилоты.
  await page.waitForTimeout(3500);
  await autopilot(page, false);
  await autopilot(guest, true);

  // (1) Урон проходит: здоровье хоста ощутимо падает (спиннер гостя бьёт).
  await expect
    .poll(() => readSelfHealth(page), { timeout: 60_000, intervals: [1000] })
    .toBeLessThan(900);

  // (2) Шкала соперника у ГОСТЯ достоверна: room-значение сходится с
  // self-authoritative здоровьем хоста (бой продолжается, допуск на лаг 12 Гц
  // публикации + продолжающиеся удары).
  const hostHealth = await readSelfHealth(page);
  const seenByGuest = await readRoomHealth(guest, hostUid!);
  expect(seenByGuest).toBeGreaterThan(0);
  expect(Math.abs(seenByGuest - hostHealth)).toBeLessThan(120);

  // (3) Числовые HP в HUD обновились: у хоста «свой» счётчик ниже максимума,
  // у гостя строка соперника показывает то же значение.
  const selfHud = await page.getByTestId('self-health').textContent();
  expect(Number(selfHud?.split('/')[0])).toBeLessThan(1000);
  const opponentHud = await guest.getByTestId(`opponent-health-${hostUid}`).textContent();
  expect(Number(opponentHud)).toBeLessThan(1000);

  await guest.close();
});

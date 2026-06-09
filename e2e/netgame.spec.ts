import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { openSimulator } from './helpers/simulator.ts';

/**
 * Полный поток сетевого режима на in-memory адаптере (без Firebase): две вкладки
 * одного браузера синхронизируются через BroadcastChannel. Доказывает связку
 * комната→лобби→бой→результат и host-авторитетный финал.
 *
 * Memory-адаптер — дефолт, поэтому реальный Firebase для теста не нужен.
 */

async function enterNet(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Сетевой бой' }).click();
  await page.getByLabel('Ваше имя').fill(name);
  await page.getByRole('button', { name: 'К списку комнат' }).click();
}

test('сетевой поток: комната → лобби → бой → результат', { tag: '@netgame' }, async ({
  page,
  context,
}) => {
  // Хозяин (вкладка A) — ждём готовую одиночную сцену, затем входим в сеть.
  await openSimulator(page);
  await enterNet(page, 'Хост');
  await page.getByLabel('Название комнаты').fill('БойВКР');
  await page.getByRole('button', { name: 'Создать комнату' }).click();
  await expect(page.getByText('Хост')).toBeVisible();

  // Гость (вкладка B) того же браузера — видит комнату через BroadcastChannel.
  const guest = await context.newPage();
  await guest.goto('/');
  await enterNet(guest, 'Гость');
  await expect(guest.getByText('БойВКР')).toBeVisible();
  await guest.getByRole('button', { name: 'Войти' }).click();

  // Оба в лобби: видно двух игроков.
  await expect(page.getByText('Гость')).toBeVisible();
  await expect(guest.getByText('Хост')).toBeVisible();

  // Готовность обоих.
  await page.getByRole('button', { name: 'Я готов' }).click();
  await guest.getByRole('button', { name: 'Я готов' }).click();

  // Хозяин стартует бой — обе вкладки переходят в боевую сцену (HUD с капитуляцией).
  const startButton = page.getByRole('button', { name: 'Начать бой' });
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(page.getByTestId('surrender')).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByTestId('surrender')).toBeVisible({ timeout: 20_000 });

  // Хозяин сдаётся → победитель Гость; результат у обоих (после обратного отсчёта).
  await page.getByTestId('surrender').click();
  await expect(guest.getByText('Победа!')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Поражение')).toBeVisible({ timeout: 15_000 });

  await guest.close();
});

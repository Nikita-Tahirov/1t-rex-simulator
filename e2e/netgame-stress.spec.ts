import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { openSimulator } from './helpers/simulator.ts';

/**
 * Стресс-сценарии сетевого режима на in-memory адаптере (несколько вкладок одного
 * браузера через BroadcastChannel): 3 игрока и полный бой, выход хоста с передачей
 * роли, реванш. Доказывают устойчивость в нетривиальных ситуациях без Firebase.
 */

async function enterNetAndOpenRooms(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Сетевой бой' }).click();
  await page.getByLabel('Ваше имя').fill(name);
  await page.getByRole('button', { name: 'К списку комнат' }).click();
}

async function joinFreshTab(context: BrowserContext, name: string): Promise<Page> {
  const tab = await context.newPage();
  await tab.goto('/');
  await enterNetAndOpenRooms(tab, name);
  await tab.getByRole('button', { name: 'Войти' }).click();
  return tab;
}

test('три игрока: бой завершается одним уцелевшим', { tag: '@netgame' }, async ({
  page,
  context,
}) => {
  await openSimulator(page);
  await enterNetAndOpenRooms(page, 'Хост');
  await page.getByLabel('Название комнаты').fill('Тройной бой');
  await page.getByRole('button', { name: 'Создать комнату' }).click();

  const guest1 = await joinFreshTab(context, 'Гость1');
  const guest2 = await joinFreshTab(context, 'Гость2');

  // Все трое видны в лобби и готовы.
  await expect(page.getByText('Гость2')).toBeVisible();
  await page.getByRole('button', { name: 'Я готов' }).click();
  await guest1.getByRole('button', { name: 'Я готов' }).click();
  await guest2.getByRole('button', { name: 'Я готов' }).click();

  const start = page.getByRole('button', { name: 'Начать бой' });
  await expect(start).toBeEnabled();
  await start.click();

  // Двое гостей сдаются → хозяин остаётся уцелевшим.
  await guest1.getByTestId('surrender').click({ timeout: 20_000 });
  await guest2.getByTestId('surrender').click({ timeout: 20_000 });

  await expect(page.getByText('Победа!')).toBeVisible({ timeout: 15_000 });
  await expect(guest1.getByText('Поражение')).toBeVisible({ timeout: 15_000 });
  await expect(guest2.getByText('Поражение')).toBeVisible({ timeout: 15_000 });

  await guest1.close();
  await guest2.close();
});

test('выход хоста в лобби передаёт роль следующему игроку', { tag: '@netgame' }, async ({
  page,
  context,
}) => {
  await openSimulator(page);
  await enterNetAndOpenRooms(page, 'Хост');
  await page.getByLabel('Название комнаты').fill('Передача хоста');
  await page.getByRole('button', { name: 'Создать комнату' }).click();

  const guest = await joinFreshTab(context, 'Преемник');
  // Вкладка игрока на переднем плане (как на его устройстве): сбрасывает
  // отложенную доставку BroadcastChannel в фоновой вкладке. Гость в лобби, не хозяин.
  await guest.bringToFront();
  await expect(guest.getByRole('button', { name: 'Я готов' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Начать бой' })).toHaveCount(0);

  // Хозяин выходит → роль переходит гостю, у него появляется «Начать бой».
  await page.bringToFront();
  await page.getByRole('button', { name: 'Выйти из комнаты' }).click();
  await guest.bringToFront();
  await expect(guest.getByRole('button', { name: 'Начать бой' })).toBeVisible({ timeout: 15_000 });

  await guest.close();
});

test('реванш возвращает обоих игроков в лобби', { tag: '@netgame' }, async ({ page, context }) => {
  await openSimulator(page);
  await enterNetAndOpenRooms(page, 'Хост');
  await page.getByLabel('Название комнаты').fill('Реванш');
  await page.getByRole('button', { name: 'Создать комнату' }).click();

  const guest = await joinFreshTab(context, 'Гость');
  await page.getByRole('button', { name: 'Я готов' }).click();
  await guest.getByRole('button', { name: 'Я готов' }).click();
  await page.getByRole('button', { name: 'Начать бой' }).click();

  await page.getByTestId('surrender').click({ timeout: 20_000 });
  await expect(guest.getByText('Победа!')).toBeVisible({ timeout: 15_000 });

  // Хозяин жмёт «Реванш» → оба возвращаются в лобби. Готовность могла сохраниться
  // с прошлого матча (быстрый реванш), поэтому индикатор лобби — кнопка выхода.
  await page.getByRole('button', { name: 'Реванш' }).click();
  await expect(page.getByRole('button', { name: 'Выйти из комнаты' })).toBeVisible({
    timeout: 10_000,
  });
  await guest.bringToFront();
  await expect(guest.getByRole('button', { name: 'Выйти из комнаты' })).toBeVisible({
    timeout: 10_000,
  });

  await guest.close();
});

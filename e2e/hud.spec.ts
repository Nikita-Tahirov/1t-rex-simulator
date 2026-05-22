import { expect, test } from './fixtures.ts';
import { openSimulator } from './helpers/simulator.ts';

test.describe('1T-REX Sim — HUD', () => {
  test('позволяет сворачивать отдельные секции без скрытия всего HUD', async ({ page }) => {
    await openSimulator(page);

    const panelHeading = page.getByRole('heading', { name: /1T-REX/i });
    await expect(panelHeading).toBeVisible();

    await expect(page.getByRole('button', { name: 'Свернуть Камера' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Свернуть Вид' })).toBeVisible();

    const modeToggle = page.getByRole('button', { name: 'Свернуть Режим' });
    await expect(modeToggle).toHaveAttribute('aria-expanded', 'true');
    await modeToggle.click();
    await expect(page.getByRole('button', { name: 'Развернуть Режим' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByRole('button', { name: 'Режим управления: Ручной' })).toBeHidden();
    await expect(panelHeading).toBeVisible();

    const missionToggle = page.getByRole('button', { name: 'Свернуть Миссия' });
    await missionToggle.click();
    await expect(page.getByRole('button', { name: 'Развернуть Миссия' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByLabel('Сценарий миссии')).toBeHidden();

    await page.reload();
    await page.waitForFunction(() => !!window.__telemetry && !!window.__scenarioStore);
    await expect(page.getByRole('button', { name: 'Развернуть Режим' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByRole('button', { name: 'Развернуть Миссия' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('целиком по-прежнему скрывается и возвращается', async ({ page }) => {
    await openSimulator(page);

    await page.getByRole('button', { name: 'Скрыть правую панель' }).click();
    await expect(page.getByRole('heading', { name: /1T-REX/i })).toBeHidden();

    await page.getByRole('button', { name: 'Показать правую панель' }).click();
    await expect(page.getByRole('heading', { name: /1T-REX/i })).toBeVisible();
    await expect(page.getByLabel('Сценарий миссии')).toBeVisible();
  });

  test('показывает прочность робота вместо урона арены', async ({ page }) => {
    await openSimulator(page);

    await expect(page.getByRole('heading', { name: 'Прочность робота' })).toBeVisible();
    await expect(page.getByText('1000 / 1000')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Урон арены' })).toHaveCount(0);
  });
});

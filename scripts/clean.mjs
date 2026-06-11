/**
 * Уборка локально перегенерируемых артефактов дев-машины: build-выходы,
 * отчёты тестов, кэши Vite, промежуточные файлы пайплайнов. Исходники и
 * git-состояние не трогает — всё из списка восстанавливается обычными
 * командами (`build`, `test`, `e2e`, `model:build`, `video:record`).
 */
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '.vite',
  'node_modules/.vite',
  'tmp',
  '.playwright-mcp',
  'docs/video/_recording',
  'public/models/.tmp',
];

let removed = 0;
for (const target of targets) {
  const fullPath = path.join(rootDir, target);
  if (!existsSync(fullPath)) continue;
  rmSync(fullPath, { recursive: true, force: true });
  console.log(`удалено: ${target}`);
  removed += 1;
}
console.log(removed === 0 ? 'чисто: артефактов не найдено' : `готово: удалено ${removed}`);

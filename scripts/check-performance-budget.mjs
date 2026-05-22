import { createReadStream, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createGzip } from 'node:zlib';

const ROOT = process.cwd();
const budget = JSON.parse(await readFile(path.join(ROOT, 'budgets/performance.json'), 'utf8'));
const assetsDir = path.join(ROOT, 'dist/assets');
const modelsDir = path.join(ROOT, 'dist/models');

function files(dir, predicate = () => true) {
  return readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((file) => predicate(file));
}

function gzipSize(file) {
  return new Promise((resolve, reject) => {
    let total = 0;
    createReadStream(file)
      .pipe(createGzip())
      .on('data', (chunk) => {
        total += chunk.length;
      })
      .on('end', () => resolve(total))
      .on('error', reject);
  });
}

function kb(bytes) {
  return bytes / 1024;
}

const jsFiles = files(assetsDir, (file) => file.endsWith('.js'));
const cssFiles = files(assetsDir, (file) => file.endsWith('.css'));
const modelFiles = files(modelsDir, (file) => file.endsWith('.glb'));
const jsGzip = await Promise.all(jsFiles.map(gzipSize));
const cssGzip = await Promise.all(cssFiles.map(gzipSize));
const totalJsGzipKb = kb(jsGzip.reduce((sum, value) => sum + value, 0));
const totalCssGzipKb = kb(cssGzip.reduce((sum, value) => sum + value, 0));
const entryFile = jsFiles.find((file) => path.basename(file).startsWith('index-'));
const entryJsGzipKb = entryFile ? kb(await gzipSize(entryFile)) : Number.POSITIVE_INFINITY;
const maxRawChunkKb = Math.max(...jsFiles.map((file) => kb(statSync(file).size)));
const modelTotalKb = kb(modelFiles.reduce((sum, file) => sum + statSync(file).size, 0));

const checks = [
  ['bundle.totalJsGzipKb', totalJsGzipKb, budget.bundle.maxTotalJsGzipKb],
  ['bundle.entryJsGzipKb', entryJsGzipKb, budget.bundle.maxEntryJsGzipKb],
  ['bundle.cssGzipKb', totalCssGzipKb, budget.bundle.maxCssGzipKb],
  ['bundle.maxRawChunkKb', maxRawChunkKb, budget.bundle.maxRawChunkKb],
  ['assets.modelTotalKb', modelTotalKb, budget.assets.maxModelTotalKb],
];
const failed = checks.filter(([, actual, max]) => actual > max);

console.log(
  JSON.stringify(
    Object.fromEntries(checks.map(([name, actual, max]) => [name, { actual: kbTo1(actual), max }])),
    null,
    2,
  ),
);
if (failed.length > 0) {
  console.error('Performance budget failed.');
  process.exitCode = 1;
}

function kbTo1(value) {
  return Number(value.toFixed(1));
}

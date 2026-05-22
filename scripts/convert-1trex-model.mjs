// Конвейер сжатия 3D-моделей 1T-REX для веб-симулятора.
//
// Источник: `робот/glb-source/RobotYbiyca_*.glb` — несжатые GLB,
// экспортированные Blender (Khronos glTF I/O) из CAD-сборки команды 1Т.
// Выход:    `public/models/1trex-{corpus,spinner,wheel}.glb`
// Pipeline: gltf-transform optimize (weld → simplify → prune → draco).
//
// Запуск: npm run model:build
//
// Степени упрощения подобраны эмпирически так, чтобы сохранить силуэт CAD,
// но снизить размер до < 500 КБ на компонент. Текстур в моделях нет.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(PROJECT_ROOT, 'робот', 'glb-source');
const OUT_DIR = resolve(PROJECT_ROOT, 'public', 'models');
const npmCli = process.env.npm_execpath;
const npmNode = process.env.npm_node_execpath ?? process.execPath;

const TARGETS = [
  {
    src: 'RobotYbiyca_Corpus.glb',
    out: '1trex-corpus.glb',
    simplifyError: '0.0008',
    simplifyRatio: '0.6',
  },
  {
    src: 'RobotYbiyca_Spinner.glb',
    out: '1trex-spinner.glb',
    simplifyError: '0.0005',
    simplifyRatio: '0.7',
  },
  {
    src: 'RobotYbiyca_Wheel.glb',
    out: '1trex-wheel.glb',
    simplifyError: '0.0003',
    simplifyRatio: '0.85',
  },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const t of TARGETS) {
  const srcPath = resolve(SRC_DIR, t.src);
  const outPath = resolve(OUT_DIR, t.out);
  if (!existsSync(srcPath)) {
    throw new Error(`Source GLB not found: ${srcPath}`);
  }

  const srcSize = statSync(srcPath).size;
  console.log(`[1trex] ${t.src} (${(srcSize / 1024).toFixed(0)} KB) → ${t.out}…`);

  runNpmExec([
    'gltf-transform',
    'optimize',
    srcPath,
    outPath,
    '--compress',
    'draco',
    '--simplify',
    'true',
    '--simplify-error',
    t.simplifyError,
    '--simplify-ratio',
    t.simplifyRatio,
    '--no-prune-attributes',
    '--texture-compress',
    'webp',
  ]);

  const outSize = statSync(outPath).size;
  console.log(
    `[1trex] DONE ${t.out} — ${(outSize / 1024).toFixed(0)} KB ` +
      `(${((1 - outSize / srcSize) * 100).toFixed(0)}% smaller)`,
  );
}

function runNpmExec(args) {
  if (!npmCli) {
    throw new Error('npm_execpath is unavailable; run model:build through `npm run model:build`.');
  }
  execFileSync(npmNode, [npmCli, 'exec', '--', ...args], { stdio: 'inherit' });
}

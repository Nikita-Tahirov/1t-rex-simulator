import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJson = readJson('package.json');
const errors = [];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const ignoredDirs = new Set([
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
]);
const forbiddenRootFiles = [/^\.codex-.*\.log$/, /^firebase-debug.*\.log$/, /^npm-debug\.log/];
const forbiddenPatterns = [
  { re: /(?:\/\/|\/\*)\s*@ts-ignore/u, message: '@ts-ignore is forbidden; fix the type boundary' },
  {
    re: /(?:\/\/|\/\*)\s*eslint-disable(?![^\n]*(reason|because|--))/u,
    message: 'eslint-disable needs a local reason',
  },
  {
    re: /(?:\/\/|\/\*)\s*biome-ignore(?![^\n]*(reason|because|--))/u,
    message: 'biome-ignore needs a local reason',
  },
  {
    re: /:\s*any\b|\bas\s+any\b|<any>|Array<any>|Record<[^>\n]*,\s*any>/u,
    message: 'explicit any is forbidden outside test matchers',
  },
];

for (const entry of readdirSync(root)) {
  if (forbiddenRootFiles.some((pattern) => pattern.test(entry))) {
    errors.push(`legacy artifact in repo root: ${entry}`);
  }
}

const codeFiles = listFiles(root).filter((file) => sourceExtensions.has(path.extname(file)));
for (const file of codeFiles) scanForbiddenText(file);
checkRuntimeDependencies(codeFiles);

const roots = new Set([
  path.join(root, 'src', 'main.tsx'),
  path.join(root, 'vite.config.ts'),
  path.join(root, 'playwright.config.ts'),
  path.join(root, 'eslint.config.js'),
  path.join(root, 'tailwind.config.js'),
  path.join(root, 'src', 'test', 'setup.ts'),
  // Barrel index.ts — намеренные точки входа модулей (TypeScript-as-truth).
  // Они не обязаны импортироваться рантаймом, но фиксируют public API подмодуля
  // для документации и `npm run typecheck`. См. @packageDocumentation в каждом файле.
  path.join(root, 'src', 'control', 'index.ts'),
  path.join(root, 'src', 'sensors', 'index.ts'),
  path.join(root, 'src', 'autonomy', 'index.ts'),
  path.join(root, 'src', 'store', 'index.ts'),
  path.join(root, 'src', 'lib', 'index.ts'),
  path.join(root, 'src', 'types', 'troika-three-text.d.ts'),
  // Ambient-типизация клиентских env Vite (ImportMetaEnv) — не импортируется рантаймом.
  path.join(root, 'src', 'vite-env.d.ts'),
]);

for (const script of Object.values(packageJson.scripts ?? {})) {
  for (const match of script.matchAll(/\b(?:node|tsx)\s+((?:\.\/)?scripts[\\/][^\s;&|]+)/g)) {
    roots.add(path.resolve(root, normalizeSlashes(match[1])));
  }
}

for (const file of codeFiles) {
  const relative = toPosix(path.relative(root, file));
  if (/(\.test|\.bench|\.spec)\.(ts|tsx|js|jsx|mjs)$/.test(relative)) roots.add(file);
}

const reachable = new Set();
for (const rootFile of roots) visit(resolveExisting(rootFile));

for (const file of codeFiles) {
  if (!isSourceOwned(file)) continue;
  if (!reachable.has(file))
    errors.push(`unreachable source file: ${toPosix(path.relative(root, file))}`);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    'Source hygiene OK: no legacy artifacts, forbidden suppressions, unused runtime deps or orphan code files.',
  );
}

function readJson(file) {
  return JSON.parse(readFileSync(path.join(root, file), 'utf8'));
}

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    if (entry.name === '.firebase') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else files.push(full);
  }
  return files;
}

function scanForbiddenText(file) {
  if (toPosix(file).includes('/public/draco/')) return;
  const relative = toPosix(path.relative(root, file));
  const text = readFileSync(file, 'utf8');
  for (const { re, message } of forbiddenPatterns) {
    if (relative === 'scripts/check-source-hygiene.mjs' && message.startsWith('explicit any')) {
      continue;
    }
    if (re.test(text)) errors.push(`${relative}: ${message}`);
  }
}

function checkRuntimeDependencies(files) {
  const used = new Set();
  for (const file of files) {
    for (const specifier of importsFrom(readFileSync(file, 'utf8'))) {
      const packageName = externalPackageName(specifier);
      if (packageName) used.add(packageName);
    }
  }
  for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
    if (!used.has(dependency)) errors.push(`unused runtime dependency: ${dependency}`);
  }
}

function visit(file) {
  if (!file || reachable.has(file) || !existsSync(file)) return;
  reachable.add(file);
  const text = readFileSync(file, 'utf8');
  for (const specifier of importsFrom(text)) {
    const resolved = resolveImport(file, specifier);
    if (resolved) visit(resolved);
  }
}

function importsFrom(text) {
  const matches = [
    ...text.matchAll(/\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g),
    ...text.matchAll(/\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g),
    ...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ];
  return matches.map((match) => match[1]);
}

function resolveImport(fromFile, specifier) {
  if (specifier.startsWith('@/'))
    return resolveExisting(path.join(root, 'src', specifier.slice(2)));
  if (!specifier.startsWith('.')) return null;
  return resolveExisting(path.resolve(path.dirname(fromFile), specifier));
}

function externalPackageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('@/')) return null;
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

function resolveExisting(base) {
  if (!base) return null;
  if (existsSync(base) && statSync(base).isFile()) return path.resolve(base);
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json']) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return path.resolve(candidate);
  }
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
    const candidate = path.join(base, `index${ext}`);
    if (existsSync(candidate)) return path.resolve(candidate);
  }
  return null;
}

function isSourceOwned(file) {
  const relative = toPosix(path.relative(root, file));
  return (
    /^(src|e2e|scripts)\//.test(relative) ||
    relative.endsWith('.config.ts') ||
    relative.endsWith('.config.js')
  );
}

function normalizeSlashes(value) {
  return value.replaceAll('/', path.sep).replaceAll('\\', path.sep);
}

function toPosix(value) {
  return value.replaceAll(path.sep, '/');
}

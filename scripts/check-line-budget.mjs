import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MAX_LINES = 300;
const TEXT_EXT = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const IGNORED_DIRS = new Set([
  '.firebase',
  '.git',
  '.husky/_',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const IGNORED_FILES = new Set(['package-lock.json']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replaceAll(path.sep, '/');
    if (entry.isDirectory()) {
      if (![...IGNORED_DIRS].some((ignored) => rel === ignored || rel.startsWith(`${ignored}/`))) {
        walk(full, out);
      }
    } else if (isCountedFile(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isCountedFile(name) {
  if (IGNORED_FILES.has(name)) return false;
  return TEXT_EXT.has(path.extname(name));
}

function countLines(file) {
  const buffer = readFileSync(file);
  if (buffer.includes(0)) return 0;
  return buffer.toString('utf8').split(/\r\n|\r|\n/).length;
}

const offenders = [];
for (const file of walk(ROOT)) {
  if (statSync(file).size === 0) continue;
  const lines = countLines(file);
  if (lines > MAX_LINES) {
    offenders.push({ lines, path: path.relative(ROOT, file).replaceAll(path.sep, '/') });
  }
}

offenders.sort((a, b) => b.lines - a.lines);
if (offenders.length > 0) {
  console.error(`Line budget failed: ${offenders.length} files exceed ${MAX_LINES} lines.`);
  console.error(JSON.stringify(offenders, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Line budget OK: all counted text files are ≤ ${MAX_LINES} lines.`);
}

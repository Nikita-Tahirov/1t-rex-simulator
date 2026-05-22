import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rapierRoots = [
  path.join(root, 'node_modules', '@dimforge', 'rapier3d-compat'),
  path.join(
    root,
    'node_modules',
    '@react-three',
    'rapier',
    'node_modules',
    '@dimforge',
    'rapier3d-compat',
  ),
];

for (const rapierRoot of rapierRoots) {
  for (const file of ['rapier.mjs', 'rapier.cjs']) {
    patchRapierInit(path.join(rapierRoot, file));
  }
}

console.log('Third-party patches OK: Rapier init uses non-deprecated module_or_path form.');

function patchRapierInit(file) {
  try {
    readFileSync(file, 'utf8');
  } catch {
    return;
  }

  const source = readFileSync(file, 'utf8');
  const pattern = /yield\s+([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.toByteArray\((.*?)\)\.buffer\)/s;
  const replacement = 'yield $1({module_or_path:$2.toByteArray($3).buffer})';

  if (/yield\s+[A-Za-z_$][\w$]*\(\{module_or_path:/.test(source)) return;

  const patched = source.replace(pattern, replacement);
  if (patched === source) {
    throw new Error(`Unable to patch Rapier init in ${path.basename(file)}`);
  }

  writeFileSync(file, patched, 'utf8');
}

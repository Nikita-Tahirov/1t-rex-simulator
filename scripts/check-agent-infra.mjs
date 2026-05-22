import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, '.agents', 'manifest.json');

// Local-only automation: when .agents/manifest.json is absent (e.g. on public CI
// where developer-tooling files are git-ignored), skip with a neutral note instead
// of failing — full validation still runs on machines that have the manifest.
if (!existsSync(manifestPath)) {
  console.log('Agent infra: skipped (manifest not present in this checkout).');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const errors = [];

const REQUIRED_TOP_LEVEL = ['version', 'name', 'primarySource', 'commands', 'subagents', 'skills'];
const SCHEMA_RELATIVE = './manifest.schema.json';
const SUPPORTED_VERSION = 2;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMPONENT_NAME = /^[a-z0-9][a-z0-9-]*$/;

for (const key of REQUIRED_TOP_LEVEL) {
  if (!(key in manifest)) errors.push(`manifest is missing required field: ${key}`);
}

if (manifest.version !== SUPPORTED_VERSION) {
  errors.push(`manifest.version must be ${SUPPORTED_VERSION}, got ${manifest.version}`);
}
if (manifest.$schema !== SCHEMA_RELATIVE) {
  errors.push(`manifest.$schema must be "${SCHEMA_RELATIVE}"`);
}
if (manifest.lastUpdated && !ISO_DATE.test(manifest.lastUpdated)) {
  errors.push('manifest.lastUpdated must be YYYY-MM-DD');
}

const schemaPath = path.join(root, '.agents', 'manifest.schema.json');
if (!existsSync(schemaPath)) errors.push('.agents/manifest.schema.json is missing');

const primarySource = manifest.primarySource ?? 'CLAUDE.md';
const primarySourcePath = path.join(root, primarySource);
if (!existsSync(primarySourcePath)) {
  errors.push(`primarySource ${primarySource} is missing from repo root`);
}
const agentDoc = existsSync(primarySourcePath) ? readFileSync(primarySourcePath, 'utf8') : '';

for (const section of ['commands', 'subagents', 'skills']) {
  if (!Array.isArray(manifest[section])) {
    errors.push(`manifest.${section} must be an array`);
    continue;
  }
  for (const item of manifest[section]) validateItem(section, item);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const toolCount = Array.isArray(manifest.compatibleTools) ? manifest.compatibleTools.length : 0;
  console.log(
    `Agent infra OK: manifest v${manifest.version}, ${primarySource} as primary source, ${toolCount} compatible tools.`,
  );
}

function validateItem(section, item) {
  if (!item?.name || !item?.path) {
    errors.push(`manifest.${section} item must include name and path`);
    return;
  }
  if (!COMPONENT_NAME.test(item.name)) {
    errors.push(`${section}.${item.name}: name must be kebab-case`);
  }
  if (!item.path.startsWith('.agents/') || !item.path.endsWith('.md')) {
    errors.push(`${section}.${item.name}: path must start with .agents/ and end with .md`);
  }
  const file = path.join(root, item.path);
  if (!existsSync(file)) {
    errors.push(`${item.path} is missing`);
    return;
  }
  const text = readFileSync(file, 'utf8');
  if (!text.startsWith('---\n') || !text.includes(`name: ${item.name}`)) {
    errors.push(`${item.path} must have frontmatter name: ${item.name}`);
  }
  if (!agentDoc.includes(item.name) && !agentDoc.includes(item.path)) {
    errors.push(`${primarySource} does not reference ${item.name}`);
  }
}

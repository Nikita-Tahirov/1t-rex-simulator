import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { verifyScenarioPayload } from './scenario-log-checks.mjs';
import { parsePayload } from './scenario-log-core.mjs';

function usage() {
  console.error('Usage: npm run scenario:verify -- <scenario-log.json> [...more.json]');
  process.exitCode = 1;
}

const files = expandFiles(process.argv.slice(2));
if (files.length === 0) {
  usage();
} else {
  const results = files.map((file) => ({
    file,
    ...verifyScenarioPayload(parsePayload(readFileSync(file, 'utf8'), file)),
  }));
  console.log(JSON.stringify(results, null, 2));
  if (results.some((item) => !item.passed)) process.exitCode = 1;
}

function expandFiles(args) {
  return args.flatMap((file) => {
    if (!file.includes('*')) return [file];
    const dir = path.dirname(file);
    const pattern = path.basename(file);
    const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
    return readdirSync(dir)
      .filter((entry) => regex.test(entry))
      .sort()
      .map((entry) => path.join(dir, entry));
  });
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

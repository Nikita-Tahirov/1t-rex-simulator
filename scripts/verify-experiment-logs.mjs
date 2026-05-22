import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { verifyScenarioPayload } from './scenario-log-checks.mjs';
import { parsePayload } from './scenario-log-core.mjs';

const dir = path.join(process.cwd(), 'docs', 'experiments');
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => path.join(dir, name));

if (files.length === 0) {
  console.error('No scenario logs found in docs/experiments.');
  process.exitCode = 1;
} else {
  const results = files.map((file) => ({
    file: path.relative(process.cwd(), file).replaceAll(path.sep, '/'),
    ...verifyScenarioPayload(parsePayload(readFileSync(file, 'utf8'), file)),
  }));
  console.log(JSON.stringify(results, null, 2));
  if (results.some((item) => !item.passed)) process.exitCode = 1;
}

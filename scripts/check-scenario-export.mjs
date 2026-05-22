import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyScenarioPayload } from './scenario-log-checks.mjs';
import { parsePayload } from './scenario-log-core.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = await mkdtemp(path.join(os.tmpdir(), '1trex-scenario-export-'));
const exportPort = process.env.SIM_EXPORT_PORT ?? String(5600 + (process.pid % 1000));

try {
  await run(process.execPath, [path.join(rootDir, 'scripts', 'export-scenario-traces.mjs')], {
    ...process.env,
    SIM_EXPORT_OUT_DIR: tmpDir,
    SIM_EXPORT_PORT: exportPort,
  });
  const files = (await readdir(tmpDir))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(tmpDir, name));

  const results = await Promise.all(
    files.map(async (file) => ({
      file: path.basename(file),
      ...verifyScenarioPayload(parsePayload(await readFile(file, 'utf8'), file)),
    })),
  );
  console.log(JSON.stringify(results, null, 2));
  if (results.length < 8 || results.some((item) => !item.passed)) {
    process.exitCode = 1;
  }
} finally {
  await rm(tmpDir, { recursive: true, force: true });
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

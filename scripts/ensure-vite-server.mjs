import { spawn } from 'node:child_process';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 120_000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes('1T-REX Sim') && html.includes('id="root"');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.killed) return;
  child.kill();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5000)]);
  if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
}

export async function ensureViteServer({ rootDir, baseURL, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (await probe(baseURL)) return async () => {};

  if (process.env.SIM_URL) {
    throw new Error(`SIM_URL is set to ${baseURL}, but the simulator is not reachable`);
  }

  const url = new URL(baseURL);
  const host = url.hostname || '127.0.0.1';
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, '--host', host, '--port', port, '--strictPort'], {
    cwd: rootDir,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const collect = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-4000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before simulator became reachable:\n${output}`);
    }
    if (await probe(baseURL)) {
      return async () => {
        await stopProcess(child);
      };
    }
    await delay(500);
  }

  await stopProcess(child);
  throw new Error(`Timed out waiting for simulator at ${baseURL}:\n${output}`);
}

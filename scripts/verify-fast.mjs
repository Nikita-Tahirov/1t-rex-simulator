import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const npmCli = process.env.npm_execpath;
const npmNode = process.env.npm_node_execpath ?? process.execPath;

if (!npmCli) {
  throw new Error('npm_execpath is unavailable; run verify through `npm run verify:fast`.');
}

// Фазовая параллельная оркестрация. Шаги внутри фазы запускаются параллельно;
// фазы между собой остаются последовательными там, где есть зависимости
// (например, bundle budgets читает dist/, поэтому после build).
const PHASES = [
  {
    name: 'static checks',
    parallel: true,
    steps: [
      ['biome ci', ['exec', '--', 'biome', 'ci', '.']],
      ['eslint', ['run', 'eslint']],
      ['agent infra', ['run', 'agent:check']],
      ['typecheck', ['run', 'typecheck']],
      ['line budget', ['run', 'line:check']],
      ['source hygiene', ['run', 'source:check']],
      ['firebase ci', ['run', 'firebase:check']],
    ],
  },
  {
    name: 'tests + build + scenario logs',
    parallel: true,
    steps: [
      ['unit tests', ['run', 'test:run']],
      ['build', ['run', 'build']],
      // scenario logs — pure-CPU верификация JSON-протоколов из docs/experiments/.
      // Не требует Chromium/Vite, поэтому параллелится с тестами и сборкой.
      ['scenario logs', ['run', 'scenario:verify:experiments']],
    ],
  },
  {
    name: 'bundle budgets + hosting render',
    parallel: false,
    steps: [
      ['bundle budgets', ['run', 'budgets:check']],
      ['hosting render', ['run', 'hosting:smoke']],
    ],
  },
  {
    // Browser-шаги серийны: параллельный запуск двух Vite-серверов
    // (scenario:export на 5175, playwright webServer на 5174) на OneDrive
    // конкурирует за file watcher и приводит к Vite-startup timeout. Проверено
    // 2026-05-15: попытка параллели падает с FS-bound таймаутом.
    //
    // На shared CI runner (GitHub Actions ubuntu/windows-latest, без аппаратного
    // GPU) Rapier WASM физика идёт медленнее, чем `runs[i].timeoutMs` (Chromium
    // headless + SwiftShader). Главная доказательность ВКР — уже-сгенерированные
    // JSON-протоколы в docs/experiments/ — проверяется CPU-only шагом
    // `scenario logs` в предыдущей фазе. Поэтому при `SIM_CI_SCENARIO_OPTIONAL=1`
    // эта фаза становится warning-only: запускается, при failure пишет в лог, но
    // не валит весь gate. Локально (без env) — строгий инвариант, как раньше.
    name: 'scenario export',
    parallel: false,
    optional: process.env.SIM_CI_SCENARIO_OPTIONAL === '1',
    steps: [['scenario export', ['run', 'scenario:export:check']]],
  },
  {
    name: 'playwright fast',
    parallel: false,
    steps: [['playwright fast', ['run', 'e2e:fast']]],
  },
];

const totalStart = performance.now();
try {
  for (const phase of PHASES) {
    await runPhase(phase);
  }
  const totalMs = Math.round(performance.now() - totalStart);
  console.log(`\n[verify:fast] OK in ${(totalMs / 1000).toFixed(1)} s`);
} catch (error) {
  const totalMs = Math.round(performance.now() - totalStart);
  console.error(`\n[verify:fast] FAILED after ${(totalMs / 1000).toFixed(1)} s`);
  console.error(error.message);
  process.exitCode = 1;
}

async function runPhase(phase) {
  const phaseStart = performance.now();
  const count = phase.steps.length;
  const mode = phase.parallel && count > 1 ? 'parallel' : 'serial';
  console.log(
    `\n[verify:fast] phase: ${phase.name} (${count} step${count === 1 ? '' : 's'}, ${mode})`,
  );
  try {
    if (phase.parallel && count > 1) {
      await Promise.all(phase.steps.map(([label, args]) => runStreamed(label, args)));
    } else {
      for (const [label, args] of phase.steps) await runStreamed(label, args);
    }
  } catch (error) {
    if (phase.optional) {
      const ms = Math.round(performance.now() - phaseStart);
      console.warn(
        `[verify:fast] phase '${phase.name}' failed after ${(ms / 1000).toFixed(1)} s but is marked optional in this environment: ${error.message}`,
      );
      return;
    }
    throw error;
  }
  const ms = Math.round(performance.now() - phaseStart);
  console.log(`[verify:fast] phase done: ${phase.name} (${(ms / 1000).toFixed(1)} s)`);
}

function runStreamed(label, args) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    console.log(`[${label}] start`);
    const child = spawn(npmNode, [npmCli, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const prefix = `[${label}] `;
    let stdoutTail = '';
    let stderrTail = '';
    child.stdout.on('data', (chunk) => {
      stdoutTail = streamLines(stdoutTail, chunk.toString(), prefix, process.stdout);
    });
    child.stderr.on('data', (chunk) => {
      stderrTail = streamLines(stderrTail, chunk.toString(), prefix, process.stderr);
    });
    child.on('exit', (code) => {
      if (stdoutTail) process.stdout.write(`${prefix}${stdoutTail}\n`);
      if (stderrTail) process.stderr.write(`${prefix}${stderrTail}\n`);
      const ms = Math.round(performance.now() - start);
      if (code === 0) {
        console.log(`[${label}] done (${(ms / 1000).toFixed(1)} s)`);
        resolve();
      } else {
        const message = `${label} exited with ${code} after ${(ms / 1000).toFixed(1)} s`;
        console.error(`[${label}] FAILED (${(ms / 1000).toFixed(1)} s)`);
        reject(new Error(message));
      }
    });
    child.on('error', reject);
  });
}

function streamLines(tail, chunk, prefix, sink) {
  const combined = tail + chunk;
  const lines = combined.split('\n');
  const lastLine = lines.pop() ?? '';
  for (const line of lines) sink.write(`${prefix}${line}\n`);
  return lastLine;
}

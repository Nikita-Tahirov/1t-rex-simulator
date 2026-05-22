import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const firebase = JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const hosting = firebase.hosting;

if (!existsSync(path.join(distDir, 'index.html'))) {
  throw new Error('dist/index.html is missing; run `npm run build` first.');
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const filePath = resolveFile(pathname);
  const headers = headersFor(pathname, filePath);
  response.writeHead(filePath.status, headers);
  response.end(filePath.path === null ? 'Not found' : readFileSync(filePath.path));
});

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('HTTP server did not bind');
  const baseURL = `http://127.0.0.1:${address.port}/`;
  await checkMissingAssetFallback(baseURL);
  await checkRenderedScene(baseURL);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

function resolveFile(pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const direct = path.normalize(path.join(distDir, relative));
  if (direct.startsWith(distDir) && existsSync(direct)) return { path: direct, status: 200 };
  if (shouldRewrite(pathname)) return { path: path.join(distDir, 'index.html'), status: 200 };
  return { path: null, status: 404 };
}

function headersFor(pathname, file) {
  const headers = {
    'Content-Type': file.path === null ? 'text/plain; charset=utf-8' : contentType(file.path),
  };
  for (const rule of hosting.headers ?? []) {
    if (!matchesRule(rule, pathname)) continue;
    for (const header of rule.headers ?? []) headers[header.key] = header.value;
  }
  return headers;
}

function shouldRewrite(pathname) {
  return (hosting.rewrites ?? []).some(
    (rule) => rule.destination === '/index.html' && matchesRule(rule, pathname),
  );
}

function matchesRule(rule, pathname) {
  if (rule.regex) return new RegExp(rule.regex, 'u').test(pathname);
  if (rule.source) return matchesSource(rule.source, pathname);
  return false;
}

function matchesSource(source, pathname) {
  if (source === '**') return true;
  if (source === '/') return pathname === '/';
  if (source === '**/*.@(wasm)') return pathname.endsWith('.wasm');
  if (source === '{assets,fonts}/**') return /^\/(?:assets|fonts)\//u.test(pathname);
  if (source === '{models,draco}/**') return /^\/(?:models|draco)\//u.test(pathname);
  if (source === '*.@(svg|png|jpg|webp)') return /\.(svg|png|jpg|webp)$/u.test(pathname);
  if (source === '{index.html,offline.html,sw.js,manifest.webmanifest}') {
    return /^\/(?:index\.html|offline\.html|sw\.js|manifest\.webmanifest)$/u.test(pathname);
  }
  return false;
}

function contentType(file) {
  switch (path.extname(file)) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.glb':
      return 'model/gltf-binary';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
    case '.webmanifest':
      return 'application/manifest+json';
    case '.svg':
      return 'image/svg+xml';
    case '.wasm':
      return 'application/wasm';
    default:
      return 'application/octet-stream';
  }
}

async function checkMissingAssetFallback(baseURL) {
  const response = await fetch(new URL('/assets/missing-oldhash-abc123.js', baseURL));
  if (response.headers.get('cache-control') !== 'no-cache') {
    throw new Error('missing asset fallback must not be immutable cached');
  }
}

async function checkRenderedScene(baseURL) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const browserErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    if (!/ERR_ABORTED|aborted|canceled|cancelled/iu.test(failure)) {
      browserErrors.push(`requestfailed: ${request.url()} (${failure})`);
    }
  });

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.crossOriginIsolated === true, null, {
      timeout: 10_000,
    });
    await page.waitForFunction(
      () =>
        !!window.__cameraState &&
        (window.__telemetry?.positionY ?? 0) !== 0 &&
        (window.__sceneRenderState?.meshCount ?? 0) > 20 &&
        (window.__sceneRenderState?.renderCalls ?? 0) > 0,
      null,
      { timeout: 20_000 },
    );
    if (browserErrors.length > 0) throw new Error(browserErrors.join('\n'));
    const state = await page.evaluate(() => ({
      camera: window.__cameraState,
      scene: window.__sceneRenderState,
      y: window.__telemetry?.positionY,
    }));
    console.log(JSON.stringify({ hostingRender: 'ok', state }, null, 2));
  } finally {
    await browser.close();
  }
}

import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const firebase = readJson('firebase.json');
const manifest = readJson('public/manifest.webmanifest');
const dependabot = readText('.github/dependabot.yml');
const verifyWorkflow = readText('.github/workflows/verify.yml');
const deployWorkflow = readText('.github/workflows/deploy.yml');

checkFirebaseHosting();
checkManifest();
checkDependabot();
checkVerifyWorkflow();
checkDeployWorkflow();

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Firebase/CI OK: hosting headers, PWA manifest and GitHub workflows are guarded.');
}

function readJson(file) {
  return JSON.parse(readFileSync(path.join(root, file), 'utf8'));
}

function readText(file) {
  return readFileSync(path.join(root, file), 'utf8');
}

function checkFirebaseHosting() {
  const hosting = firebase.hosting;
  if (hosting?.public !== 'dist') errors.push('firebase.json: hosting.public must be dist');
  if (
    !hosting?.rewrites?.some((item) => item.source === '**' && item.destination === '/index.html')
  ) {
    errors.push('firebase.json: SPA rewrite ** -> /index.html is missing');
  }
  const globalHeaders = headersFor('**');
  requireHeader(globalHeaders, 'Cross-Origin-Opener-Policy', 'same-origin');
  requireHeader(globalHeaders, 'Cross-Origin-Embedder-Policy', 'require-corp');
  requireHeader(globalHeaders, 'Cross-Origin-Resource-Policy', 'same-origin');
  requireHeader(globalHeaders, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  requireHeader(globalHeaders, 'X-Content-Type-Options', 'nosniff');
  requireHeader(globalHeaders, 'X-Frame-Options', 'DENY');
  requireHeader(globalHeaders, 'Referrer-Policy', 'strict-origin-when-cross-origin');
  requireHeaderIncludes(globalHeaders, 'Permissions-Policy', [
    'camera=()',
    'geolocation=()',
    'microphone=()',
    'payment=()',
  ]);
  requireHeaderIncludes(globalHeaders, 'Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ]);
  requireHeader(headersFor('**/*.@(wasm)'), 'Content-Type', 'application/wasm');
  requireHeader(headersFor('{assets,fonts}/**'), 'Cache-Control', 'no-cache');
  requireHeader(
    headersFor('{models,draco}/**'),
    'Cache-Control',
    'public, max-age=31536000, immutable',
  );
  requireHeader(
    headersFor('{index.html,offline.html,sw.js,manifest.webmanifest}'),
    'Cache-Control',
    'no-cache',
  );
  requireHeader(headersFor('/'), 'Cache-Control', 'no-cache');
}

function checkManifest() {
  if (manifest.id !== '/' || manifest.scope !== '/' || manifest.start_url !== '/') {
    errors.push('manifest.webmanifest: id/scope/start_url must stay root-scoped');
  }
  if (manifest.lang !== 'ru-RU') errors.push('manifest.webmanifest: lang must be ru-RU');
  if (!manifest.icons?.some((icon) => icon.purpose?.includes('maskable'))) {
    errors.push('manifest.webmanifest: at least one maskable icon is required');
  }
}

function checkVerifyWorkflow() {
  requireWorkflowText(verifyWorkflow, '.github/workflows/verify.yml', [
    'permissions:',
    'contents: read',
    'ubuntu-latest',
    'windows-latest',
    'npm ci',
    'npm audit --audit-level=high',
    'npm run verify',
    'actions/upload-artifact@v4',
  ]);
}

function checkDependabot() {
  requireWorkflowText(dependabot, '.github/dependabot.yml', [
    'package-ecosystem: npm',
    'package-ecosystem: github-actions',
    'interval: weekly',
  ]);
}

function checkDeployWorkflow() {
  requireWorkflowText(deployWorkflow, '.github/workflows/deploy.yml', [
    'permissions:',
    'contents: read',
    'workflow_dispatch:',
    'release/*',
    'npm audit --audit-level=high',
    'npm run build',
    'node scripts/check-performance-budget.mjs',
    'FirebaseExtended/action-hosting-deploy@v0',
    'FIREBASE_SERVICE_ACCOUNT',
    'FIREBASE_PROJECT_ID',
    'firebase-preview',
    'firebase-production',
    'channelId: live',
  ]);
}

function headersFor(source) {
  const item = firebase.hosting?.headers?.find((entry) => entry.source === source);
  return new Map((item?.headers ?? []).map((header) => [header.key, header.value]));
}

function requireHeader(headers, key, expected) {
  const actual = headers.get(key);
  if (actual !== expected) errors.push(`firebase.json: ${key} must be ${expected}`);
}

function requireHeaderIncludes(headers, key, fragments) {
  const actual = headers.get(key) ?? '';
  for (const fragment of fragments) {
    if (!actual.includes(fragment)) errors.push(`firebase.json: ${key} must include ${fragment}`);
  }
}

function requireWorkflowText(text, file, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) errors.push(`${file}: missing ${fragment}`);
  }
}

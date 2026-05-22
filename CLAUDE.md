# CLAUDE.md — 1T-REX Simulator

> **Этот файл играет роль `AGENTS.md`** (Linux Foundation / Agentic AI Foundation
> open standard) для Claude Code, Codex CLI, Cursor, Aider, Copilot, Gemini CLI,
> Windsurf, Amazon Q и любых других repo-агентов. Отдельный `AGENTS.md` намеренно
> не создаётся, чтобы поддерживать единый источник истины. `.agents/manifest.json`
> явно перечисляет этот файл как `primarySource` и `alsoKnownAs: ["AGENTS.md"]`.

Манифест проверяется кодом: `npm run agent:check` валидирует, что каждое имя из
`.agents/manifest.json` упомянуто здесь, имеет frontmatter и существующий файл.

## Глубинная задача

Пользователь просит не «почистить код», а сделать симулятор самопроверяемым
артефактом ВКР: следующий агент должен за 10 минут понять систему, изменить её
без потери физики/доказательности и получить машинный ответ `pass/fail`.

Основание: в запросе явно названы разведка, манифест агента, budgets, peak-load,
самооценка, cross-platform, запуск руками и документация. Значит цель — не
косметика, а инженерная управляемость ∧ воспроизводимое качество.

## Локальный запуск

Требования: Node.js ≥ 24.15.0 и npm ≥ 11.12.1.

```bash
npm install
npm run dev
```

Симулятор поднимается через Vite на `http://127.0.0.1:5173/`.
Порт фиксированный (`strictPort: true`). Если `5173` занят чужим процессом,
для временного второго экземпляра можно запустить:
`npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`.

## Команды

| Команда | Назначение |
|:--|:--|
| `npm run dev` | локальный Vite на `http://127.0.0.1:5173/`; fallback: `--port 5174 --strictPort` |
| `npm run verify` | полный gate, фазовая параллельная оркестрация: статика+typecheck (parallel) → unit+bench+build+scenario logs (parallel) → budgets → scenario export → полная browser-матрица |
| `npm run verify:fast` | быстрый gate, та же оркестрация без bench и без mobile/firefox/webkit smoke. Эталонное время на i7-11800H + RTX 3080: ≈4 мин 0 с |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run test:run` | Vitest unit/regression |
| `npm run bench:run` | Vitest benchmark |
| `npm run line:check` | ∀ counted text files ≤ 300 строк |
| `npm run source:check` | нет `.codex-*` логов, suppressions без причины, явного `any`, unused runtime deps, сиротских source-файлов |
| `npm run firebase:check` | Firebase headers, PWA manifest, Dependabot и GitHub Actions workflows |
| `npm run hosting:smoke` | production-like проверка Firebase headers и WebGL-рендера сцены из `dist/` |
| `npm run budgets:check` | gzip/raw/model budgets по `budgets/performance.json` |
| `npm run scenario:export` | экспорт JSON-протоколов сценариев в `docs/experiments/`; default export server `127.0.0.1:5175` |
| `npm run scenario:export:check` | свежий экспорт во временную папку + независимая проверка 8 PASS-логов |
| `npm run scenario:verify -- docs/experiments/*.json` | независимая CLI-проверка протоколов |
| `npm run e2e:fast` | Chromium smoke: cross-env, drive, HUD, experiments, collision |
| `npx playwright test` | e2e + accessibility + perf + cross-env smoke |

## Границы

- Не запускать `firebase deploy`, `git push`, `git reset --hard` без явного запроса.
- Не менять стек: Vite/React/TS/R3F/Rapier/Biome/Vitest/Playwright.
- Не добавлять зависимости без записи причины в PR/ответ.
- Не глушить `@ts-ignore`, `eslint-disable`, `biome-ignore` без локальной причины.
- Не менять GLB через ручное редактирование; только `npm run model:build`.
- Не трогать yaw/yawRate convention точечно. После любой физики: `npx playwright test e2e/drive.spec.ts e2e/collision.spec.ts --project=chromium`.
- После правок сценариев или verifier: `npm run scenario:export:check` и `npm run scenario:verify:experiments`.

## Структура

| Каталог | Ответственность |
|:--|:--|
| `src/control` | чистые модели PID/motor/battery/drivetrain |
| `src/sensors` | IMU/encoder/filter models |
| `src/autonomy` | FSM и BT |
| `src/physics` | R3F/Rapier сцена, робот, арена |
| `src/scenarios` | сценарии, runner, verification |
| `src/hud` | UI панели |
| `src/lib` | общие утилиты (clamp, cn) |
| `src/monitoring` | error/runtime performance hooks |
| `src/offline` | service worker registration |
| `e2e` | Playwright сценарии, cross-env, runtime FPS |
| `scripts` | agent-safe automation |
| `.agents` | subagents, slash-команды, skills, `manifest.json` v2 + schema |
| `docs` | архитектура, эксперименты, onboarding, self-assessment |
| `public/manifest.webmanifest` | PWA-манифест (id, scope, icons, theme) |

## Public API контракты (TypeScript-as-truth)

У каждого переносимого подмодуля есть barrel `index.ts` с TSDoc
`@packageDocumentation`-блоком — это явная точка входа для AI-агента и
`npm run typecheck`. Прямые импорты из подфайлов разрешены, но `index.ts`
остаётся источником истины:

- [src/control/index.ts](src/control/index.ts) — `PIDController`, `MotorModel`, `BatteryModel`, `Drivetrain4WD`.
- [src/sensors/index.ts](src/sensors/index.ts) — `IMUSensor`, `EncoderSensor`, `ComplementaryFilter`, `MadgwickFilter`, `lidar`.
- [src/autonomy/index.ts](src/autonomy/index.ts) — `BehaviorFSM`, `RobotBTAgent`, `makeBehaviorTree`.
- [src/store/index.ts](src/store/index.ts) — `useSimStore`, `useScenarioStore`, `telemetry`, `useTelemetryFrame`.
- [src/lib/index.ts](src/lib/index.ts) — `clamp`, `createRafSampler`.

`scripts/check-source-hygiene.mjs` намеренно держит эти barrel-файлы в `roots`,
поэтому они не считаются сиротами, даже если runtime их не импортирует.

## Инварианты

- Каждый counted text file ≤ 300 строк.
- Цвета и повторяемые числа выносить в tokens/data/constants.
- Public API подмодулей `src/control`, `src/sensors`, `src/autonomy`,
  `src/store`, `src/lib` объявляется в barrel-файле `index.ts` с TSDoc
  `@packageDocumentation`. Новые публичные exports добавлять в barrel.
- TypeScript-типы — единственный источник истины структуры; TSDoc описывает
  intent/edge cases, не дублирует структурную информацию из типов.
- `any`, `@ts-ignore`, undocumented `as unknown as` запрещены инвариантом
  `source:check`. Подавление лишь с локальной причиной комментарием.
- Внешний JSON считать `unknown` → validate/normalize на границе.
- Hot path (`useFrame`, scenario tick) без лишних аллокаций, `setState`, O(N²).
- Высокочастотная телеметрия → `valtio` in-place tuples.
- `setState` из таймеров hud-вкладок — только через `requestAnimationFrame`,
  иначе React 19 ругается `Cannot update component while rendering another`.
- Scenario log — доказательство, UI summary не считается доказательством.
- `verifyScenarioLog`: command → motion → scenario progress → goal.
- Browser export и Node verifier должны оставаться в паритете с TS verifier; embedded `verification.passed` обязателен.
- `obstacleAvoidance` доказывает не только финиш, но и порядок прохождения коридора, плотность лога, отсутствие телепортов и `collisions = 0`.
- Кинематическое шасси не должно проходить сквозь fixed non-sensor colliders: translation clamp + yaw pose-overlap guard в `useKinematicObstacleController`.
- Визуальные обороты колёс выводятся из фактической дельты позы после clamp; стоящий робот не должен крутить колёса при ненулевом target/throttle.
- Damage VFX крепятся к deck-корпусу, а не к верхней точке GLB/ротора; огонь и искры не должны всплывать над «головой» робота.
- Offline fallback и error monitor не должны мешать старту симулятора.
- `clamp` берётся из `@/lib/math.ts`, локальные копии запрещены.
- Любые secrets — только через GitHub environment secrets, не в репо.
- Клиентских `VITE_*` env сейчас нет; tooling env описан в `.env.example`.
- `postinstall` патчит Rapier init через `scripts/patch-third-party.mjs`; если
  dependency tree меняется, сначала проверить этот скрипт и только потом
  обновлять lockfile.
- Security headers (CSP/COOP/COEP/HSTS/Permissions-Policy) заданы в `firebase.json`,
  менять только синхронно с подтверждённым e2e (Rapier WASM требует COOP/COEP).
- CSP должен оставаться строгим: не добавлять `blob:` в `script-src` ради Troika.
  Подписи сцены чинятся через `configureTextBuilder({ useWorker: false })`.
- Firebase SPA rewrite отдаёт `index.html` как fallback, поэтому `/assets` и
  `/fonts` должны оставаться `no-cache`. Иначе старый HTML может запросить уже
  отсутствующий bundle и закэшировать fallback HTML как immutable asset.

## Target 2026

См. [docs/research-2026.md](docs/research-2026.md).

## Агентская инфраструктура

`.agents/` — единый реестр для repo-агентов, описанный схемой
[.agents/manifest.schema.json](.agents/manifest.schema.json). Манифест v2 содержит
`$schema`, `version: 2`, `primarySource: CLAUDE.md`, `compatibleTools` и три
секции — `commands`, `subagents`, `skills`.

### Subagents

Subagents в [.agents/subagents](.agents/subagents) имеют YAML frontmatter
с `name`, `description`, `tools` allowlist, `model`:

- `architecture-reviewer` — границы модулей, файлы >300, dead code, TSDoc на public API, barrel-контракты.
- `performance-verifier` — budgets, FPS, peak-load, bundle.
- `scenario-verifier` — JSON-протоколы, V&V, regression.
- `accessibility-i18n-reviewer` — WCAG 2.2, labels, locale.

## Slash-команды

Slash-команды лежат в [.agents/commands](.agents/commands):

- `/verify` — полный gate.
- `/scenario-audit` — экспорт ∧ независимая проверка сценариев.
- `/perf-budget` — build ∧ bundle/runtime budgets.
- `/first-touch` — быстрый старт следующего агента.

## Skills

Локальные skill-файлы лежат в [.agents/skills](.agents/skills):

- `robot-scenario-verification` — работа с JSON-протоколами сценариев.
- `web-sim-performance` — FPS, bundle, LoAF, peak-load.

## Быстрый старт агента

1. Прочитать этот файл и [docs/agent-onboarding.md](docs/agent-onboarding.md).
2. Запустить `npm run verify:fast`.
3. Если gate красный, чинить корневую причину ∧ добавить regression.
4. Перед передачей крупной physics/scenario правки запустить `npm run verify`.
5. После правки документации/команд обновить этот файл.

## Тестовая инфраструктура

Фазовая параллельная оркестрация в `scripts/verify-fast.mjs` и `scripts/verify.mjs`.
Шаги внутри фазы — параллельно; фазы серийны там, где есть зависимости.

| Фаза | Шаги | Эталон |
|:--|:--|:--:|
| 1. static checks (parallel × 7) | biome ci, eslint, agent infra, typecheck, line, source, firebase | ~6 s |
| 2. tests + build + scenario logs (parallel × 3) | vitest, vite build, `scenario:verify:experiments` | ~12 s |
| 3. bundle budgets + hosting render | `budgets:check`, `hosting:smoke` | ~3 s |
| 4. scenario export (serial) | `scenario:export:check` (8 сценариев в одном Chromium) | ~180-300 s |
| 5. playwright (serial) | `e2e:fast` / `e2e` (workers=4) | ~65-95 s |
| **Total verify:fast** |  | **~260-421 s** |

Конфигурация:

- Playwright (`playwright.config.ts`): `fullyParallel: true`, `workers: 4` по умолчанию.
  Override через `SIM_E2E_WORKERS`. На референсной машине (i7-11800H, 16T, RTX 3080)
  workers=4 — sweet spot; 6/8 дают такое же или худшее время (Chromium worker уже
  забирает >2 потоков на физику+рендер). `drive.spec.ts` и `experiments.spec.ts`
  остаются `mode: 'serial'` из-за timing-чувствительности pose-driver vs scenario tick.
- Vitest (`vite.config.ts`): `pool: 'threads'` — worker_threads быстрее process.fork
  для не-native кода. jsdom оставлен глобально.
- `scripts/export-scenario-traces.mjs`: `PARALLELISM=1` по умолчанию (serial,
  детерминированный экспорт артефактов ВКР). Опциональный `SIM_EXPORT_PARALLEL=2`
  даёт ad-hoc ускорение, но параллельные физические шаги теряют фреймы и верификатор
  ловит ложные «телепорты» по `maxSegmentSpeedMps` — только для быстрой обратной связи.
- Параллельный запуск двух Vite-серверов (scenario:export ∥ playwright) проверен
  и откатан: на OneDrive+кириллице file watcher не справляется, Vite-startup
  таймаутит. Browser-фазы серийны намеренно.

### CPU vs GPU характер нагрузки

Workload фундаментально **CPU-bound**: Rapier 3D — WASM SIMD на CPU, никакая
physics-engine для веба (май 2026) не считает физику на GPU compute. TS, Vite,
Biome, ESLint, scenario tick, verification — тоже CPU. WebGL-рендер 3D-сцены
1T-REX лёгкий относительно физики, поэтому GPU (например, RTX 3080 Laptop)
задействован ~10-15% даже когда CPU 88%. Это **не дефект конфигурации и не
блокировка ОС**: `--use-angle=d3d11` активен, Chromium держит ~2 GB VRAM,
nvidia-smi видит карту. Рендеринг просто занимает миллисекунды на кадр.

## CI / Deploy

- `.github/workflows/verify.yml` — `npm audit --audit-level=high` + полный verify
  на ubuntu+windows, артефакты Playwright при падении, dist при успехе на main.
- `.github/workflows/deploy.yml` — деплой на Firebase Hosting. Триггеры:
  push в `main` → production-деплой (включено 2026-05-22 перед защитой ВКР,
  чтобы live-ссылка `rex-1t.web.app` всегда отражала последний коммит main);
  `workflow_dispatch` → ручной preview ∨ production; тег `release/*` →
  production по метке релиза.
- `.github/dependabot.yml` — еженедельные обновления npm и GitHub Actions.
- Secrets, которые ожидает deploy workflow:
  - `FIREBASE_SERVICE_ACCOUNT` — JSON service-account для firebase-tools.
  - `FIREBASE_PROJECT_ID` — id проекта Firebase.

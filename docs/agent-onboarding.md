# Agent Onboarding

## За 10 минут

1. Прочитать `CLAUDE.md` (он же играет роль `AGENTS.md` — единый манифест
   для Claude Code, Codex CLI, Cursor, Aider, Copilot, Gemini CLI, Windsurf,
   Amazon Q). Отдельный `AGENTS.md` намеренно не создаётся.
2. Запустить `npm run verify:fast`.
3. Если красный gate — чинить первый failing step.
4. Перед передачей крупной правки запустить `npm run verify`.
5. Для physics/control/scenarios дополнительно держать в голове yaw convention:
   `yaw = atan2(forward.z, forward.x)`, `yawRate = -angvel.y`.

## Что важно

- Это SPA на Vite + React 19 + R3F + Rapier.
- Физика робота intentionally hybrid kinematic: demo reliability > full rigid-body realism. Fixed non-sensor объекты должны блокировать translation и yaw-позу через `useKinematicObstacleController`.
- Видимое вращение колёс считается от фактической дельты позы после clamp; не возвращать зависимость визуала от остаточного `RigidBody.angvel()`.
- JSON-протокол сценария — основной доказательный артефакт ВКР.
- Browser export, TS verifier и Node verifier должны оставаться в паритете; `summary` без embedded `verification` не считается PASS.
- `docs/experiments/*.json` могут быть minified; читать их инструментами, не глазами.
- `node_modules`, `dist`, `public/models`, `public/draco` не считать исходным кодом.
- Runtime FPS gate различает GPU renderer и SwiftShader/software renderer; при
  падении сначала смотреть renderer в ошибке Playwright, затем уже оптимизировать сцену.
- `source:check` ловит сироты, unused runtime deps, рабочие `.codex-*` логи, suppressions без причины и явный `any`.
- `agent:check` валидирует `.agents/manifest.json` v2 против `.agents/manifest.schema.json`.
- `firebase:check` держит Firebase headers, manifest, Dependabot и workflows в проверяемом состоянии.
- Клиентских env-переменных нет. Tooling-переменные см. в `.env.example`; секреты только в GitHub environment secrets.

## Public API (TypeScript-as-truth)

Каждый переносимый подмодуль объявляет публичный контракт в barrel `index.ts`
с TSDoc `@packageDocumentation`:

- [src/control/index.ts](../src/control/index.ts) — PID/motor/battery/drivetrain.
- [src/sensors/index.ts](../src/sensors/index.ts) — IMU/encoder/lidar/filters.
- [src/autonomy/index.ts](../src/autonomy/index.ts) — FSM и BT.
- [src/store/index.ts](../src/store/index.ts) — zustand + valtio + scenario log.
- [src/lib/index.ts](../src/lib/index.ts) — `clamp`, `createRafSampler`.

Новые публичные exports добавлять в barrel, иначе они невидимы агенту как часть
контракта. Прямые импорты из подфайлов допустимы для внутреннего кода.

## Что запускать после правок

| Зона правки | Минимальный gate |
|:--|:--|
| Документация/команды | `npm run line:check` |
| `.agents/` (manifest, subagents, commands, skills) | `npm run agent:check` |
| Public API подмодуля | `npm run typecheck && npm run source:check` |
| Physics/yaw/collision | `npx playwright test e2e/drive.spec.ts e2e/collision.spec.ts --project=chromium` |
| Scenarios/verifier/export | `npm run scenario:export:check && npm run scenario:verify:experiments` |
| Перед передачей результата | `npm run verify:fast`; для релизной уверенности — `npm run verify` |

## Где смотреть

| Нужно | Файл |
|:--|:--|
| Правила агента (AGENTS.md=CLAUDE.md) | `CLAUDE.md` |
| Архитектура | `docs/architecture.md` |
| Модели | `docs/models.md` |
| Упрощения физики | `docs/assumptions.md` |
| Практики 2026 | `docs/research-2026.md` |
| Домены качества | `docs/self-assessment.md` |
| Budgets | `budgets/performance.json` |
| Schema агентского манифеста | `.agents/manifest.schema.json` |
| Firebase/CI | `.github/workflows/*.yml`, `.github/dependabot.yml`, `firebase.json`, `.env.example` |

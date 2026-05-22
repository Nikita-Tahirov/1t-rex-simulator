# Research 2026

Дата среза: 2026-05-15.

## Источники

- AGENTS.md open standard: <https://agents.md/>
- TSDoc spec: <https://tsdoc.org/>
- Claude Code skills/subagents/hooks: <https://code.claude.com/docs/en/hooks>
- React Compiler config: <https://react.dev/reference/react-compiler/configuration>
- Vite build target/baseline: <https://vite.dev/config/build-options/>
- Vitest benchmark: <https://vitest.dev/config/benchmark>
- Playwright projects: <https://playwright.dev/docs/browsers>
- Biome CI: <https://biomejs.dev/reference/cli/>
- TypeScript strict boundaries: <https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html>,
  <https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html>
- WCAG 2.2: <https://www.w3.org/TR/wcag/>
- Design Tokens Format 2025.10: <https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/>
- Long Animation Frames API: <https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing>
- Firebase Hosting GitHub integration: <https://firebase.google.com/docs/hosting/github-integration>
- Firebase Hosting headers/config: <https://firebase.google.com/docs/hosting/full-config>
- GitHub Actions secure use: <https://docs.github.com/en/actions/reference/security/secure-use>
- Vite env variables: <https://vite.dev/guide/env-and-mode>

## Выводы для проекта

### Agent-native repository (май 2026)

- **AGENTS.md** стал de-facto cross-tool стандартом (OpenAI Codex, Cursor,
  Aider, Devin, Copilot, Gemini CLI, Windsurf, Amazon Q; передан Linux
  Foundation/Agentic AI Foundation в декабре 2025). В этом репозитории
  `CLAUDE.md` намеренно играет роль `AGENTS.md` — единый источник истины,
  `alsoKnownAs: ["AGENTS.md"]` явно объявлен в `.agents/manifest.json`.
- **Skills/Slash commands унифицированы** (Claude Code v2.1.101, апрель 2026):
  команды в `.agents/commands/` продолжают работать, skills в `.agents/skills/`
  получают приоритет при коллизии имени. Сохраняем оба формата для совместимости
  с другими agent-runners.
- **Subagents v2 формат**: YAML frontmatter с `name`, `description`, `tools`
  allowlist, `model`. Принят в проекте 2026-05-15 для всех 4 саб-агентов.
- **Manifest-as-spec**: `.agents/manifest.json` — версия 2 с `$schema` ссылкой
  и проверкой полей в `scripts/check-agent-infra.mjs`. Самопроверяемый контракт.

### TypeScript-as-truth (TSDoc, не JSDoc)

- TS-типы — единственный источник структурной правды (компилятор enforce-ит).
- TSDoc описывает intent и edge cases (`@param`, `@returns`, `@throws`,
  `@example`, `@remarks`, `@packageDocumentation`). Не дублирует структуру типов.
- Public API подмодулей объявляется через barrel-файлы `index.ts` с
  `@packageDocumentation`. Список barrel-файлов в `roots` для
  `scripts/check-source-hygiene.mjs`.
- `any`, `@ts-ignore`, недокументированный `as unknown as` запрещены
  `npm run source:check`.

### Стэк и операционка

- React 19 + Compiler: оставляем compiler pipeline, не плодим ручную memoization.
- Vite 8 baseline target: держим build target осознанным и проверяем chunk budgets.
- Vitest bench: используем для repeatable micro-bench, а fail-budget держим обычным test.
- Playwright projects: full Chromium suite + smoke на mobile/Firefox/WebKit.
- Runtime FPS: GPU budget и software-renderer fallback разделены. Headless Chromium
  может уйти в SwiftShader CPU; на Windows Playwright принудительно просит D3D11.
- Dependency compatibility: если новая minor-версия библиотеки вносит runtime
  deprecation noise без пользовательской пользы, лучше фиксировать совместимую
  версию стека и документировать причину.
- Biome `ci`: read-only gate; форматирование через `check --write` отдельно.
- TS strict: `noUncheckedIndexedAccess` и `exactOptionalPropertyTypes` уже включены; `any` запрещён.
- WCAG 2.2: целевой уровень A/AA; axe smoke ∧ ручная проверка focus/labels.
- DTCG tokens: цвета/семантика живут как tokens, scene data — как data/constants.
- LoAF: runtime monitor feature-detects `long-animation-frame` без поломки браузеров.
- Firebase Hosting: deploy workflow держим через официальный Hosting Action,
  preview/production разведены environment-ами и secrets.
- GitHub Actions: `GITHUB_TOKEN` ограничен `contents: read`; права повышать только в конкретном job.
- Vite env: клиентских `VITE_*` переменных нет, чтобы не утекали секреты в bundle.
- Third-party patches: временный postinstall patch допустим только когда он
  воспроизводим, минимален и покрыт verify/e2e. Для Rapier это лучше, чем
  держать runtime warning до апстрим-релиза.

## Целевое состояние

Приложение должно быть не «демкой», а проверяемым симуляционным стендом
с agent-native инфраструктурой по стандартам мая 2026:

- `npm run verify` даёт единый ответ качества.
- `npm run agent:check` валидирует `.agents/manifest.json` v2 против схемы.
- Любой сценарий доказывается JSON-протоколом и независимой проверкой.
- Public API каждого переносимого подмодуля — в barrel `index.ts` с TSDoc.
- Горячие пути линейные ∧ без аллокаций.
- Крупные файлы декомпозированы.
- Offline/error/performance monitoring встроены без внешнего SaaS.
- Firebase/CI/security контракт проверяется кодом, а не только глазами.
- Следующий агент (любого вендора) стартует из `CLAUDE.md`, а не из археологии переписки.

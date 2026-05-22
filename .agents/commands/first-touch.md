---
name: first-touch
description: Быстрый вход нового агента в проект.
---

# /first-touch

В этом проекте единый манифест для AI-агента — `CLAUDE.md`, который играет роль
`AGENTS.md` (отдельного `AGENTS.md` намеренно нет). Любой repo-агент (Claude Code,
Codex CLI, Cursor, Aider, Copilot, Gemini CLI, Windsurf, Amazon Q) стартует
именно с него.

Выполнить:

```bash
node -v
npm -v
npm run verify
```

Прочитать:

- `CLAUDE.md` — манифест для агента (a.k.a. AGENTS.md в терминах Linux Foundation).
- `docs/agent-onboarding.md` — 10-минутный onboarding.
- `docs/research-2026.md` — срез внешних практик.
- `docs/self-assessment.md` — текущая самооценка по доменам качества.

Опционально, если правка касается контурного слоя: открыть barrel-файлы
`src/control/index.ts`, `src/sensors/index.ts`, `src/autonomy/index.ts`,
`src/store/index.ts` — это явные точки входа public API подмодулей.

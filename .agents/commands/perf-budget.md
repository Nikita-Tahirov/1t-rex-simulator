---
name: perf-budget
description: Проверить bundle/model/runtime budgets.
---

# /perf-budget

Выполнить:

```bash
npm run build
npm run budgets:check
npm run test:run -- src/scenarios/verification.performance.test.ts
npx playwright test e2e/performance.spec.ts --project=chromium
```

Budget values живут в `budgets/performance.json`.

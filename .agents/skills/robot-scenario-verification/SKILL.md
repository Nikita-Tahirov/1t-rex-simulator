---
name: robot-scenario-verification
description: Проверять и чинить сценарии 1T-REX Simulator, JSON-протоколы, browser runner и независимый V&V gate. Использовать при изменении src/scenarios, src/physics, control/autonomy поведения или docs/experiments.
---

# Robot Scenario Verification

1. Сначала понять сценарий: `src/scenarios/*.tsx`, `ScenarioRunner`, `verification`.
2. Проверить причинную цепочку: pilot command → telemetry motion → scenario event/metric → goal.
3. Для browser-регрессии запускать:

```bash
npx playwright test e2e/experiments.spec.ts --project=chromium
```

4. Для артефактов ВКР запускать:

```bash
npm run scenario:export
npm run scenario:verify -- docs/experiments/*.json
```

5. Не принимать лог, если движение отсутствует, `pilotActive` ложный или verifier PASS основан только на summary.
6. При изменении формата лога обновить типы в `src/store/scenario-store.ts`, verifier и docs.

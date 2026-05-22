---
name: web-sim-performance
description: Оптимизировать и проверять производительность WebGL/Rapier/Vite симулятора: FPS, bundle budgets, hot-path allocations, peak-load verification и cross-environment smoke. Использовать при изменении src/physics, src/hud, build config, сценарных логов или ассетов.
---

# Web Sim Performance

1. До правки найти слой: bundle, render, physics, scenario tick, verifier или HUD.
2. В `useFrame` не добавлять `new`, React state, spread больших массивов, O(N²).
3. Проверить budgets:

```bash
npm run build
npm run budgets:check
npm run test:run -- src/scenarios/verification.performance.test.ts
npx playwright test e2e/performance.spec.ts --project=chromium
```

4. Если менялись chunks/assets, обновить `budgets/performance.json` только с причиной.
5. Если FPS падает, сначала проверить renderer в Playwright assertion:
   D3D11/Vulkan/OpenGL = GPU budget, SwiftShader/software = fallback budget.
6. Затем измерить: shadows/lights, object count, HUD graphs, physics iterations, GC.

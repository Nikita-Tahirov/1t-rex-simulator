---
name: scenario-audit
description: Перегенерировать и независимо проверить JSON-протоколы сценариев.
---

# /scenario-audit

Выполнить:

```bash
npm run scenario:export
npm run scenario:verify -- docs/experiments/*.json
```

Проверить:

- 8 JSON-протоколов есть в `docs/experiments`.
- У каждого `passed=true`.
- При fail читать `checks[].actual`, а не UI summary.

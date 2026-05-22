# 1T-REX Simulator

[![verify](https://github.com/Nikita-Tahirov/1t-rex-simulator/actions/workflows/verify.yml/badge.svg)](https://github.com/Nikita-Tahirov/1t-rex-simulator/actions/workflows/verify.yml)
[![deploy](https://github.com/Nikita-Tahirov/1t-rex-simulator/actions/workflows/deploy.yml/badge.svg)](https://github.com/Nikita-Tahirov/1t-rex-simulator/actions/workflows/deploy.yml)
[![live demo](https://img.shields.io/website?url=https%3A%2F%2Frex-1t.web.app&label=live%20demo&up_message=rex-1t.web.app)](https://rex-1t.web.app)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![node](https://img.shields.io/badge/node-%E2%89%A524.15-brightgreen)

Проверяемый программный симулятор боевого робота **1T-REX** для магистерской ВКР Никиты Тахирова — программа «Программирование интеллектуальных роботов» (ПИР24-1м, Финансовый университет).

**Запущенная версия**: <https://rex-1t.web.app>  
**Документация для научного руководителя**: [docs/](docs/)  
**Инструкция для ИИ-агента**: [CLAUDE.md](CLAUDE.md) (играет роль `AGENTS.md` — единый манифест для Claude Code, Codex CLI, Cursor, Aider и др., см. раздел [«Для AI-агентов»](#для-ai-агентов))

---

## Что это и зачем

1T-REX — реальный боевой робот команды «1Т» из Саратова. Этот программный симулятор не ограничивается визуальной 3D-демонстрацией: он выполняет роль **машинно-проверяемого исследовательского инструмента** для ВКР. Утверждение «робот выполнил сценарий» считается истинным только тогда, когда сохранённый JSON-протокол трассировки показывает причинную цепочку `команда автопилота → физический отклик → прогресс миссии → событие цели или итоговая метрика`, а независимый верификатор возвращает положительное решение.

**Что увидит проверяющий**:
- 3D-сцена с роботом и ареной 14×14 м (четыре зоны: шредер, коробки, гараж, мост).
- Панель индикации справа: режим управления, выбор камеры, выбор миссии, индикаторы скорости/тахометров/искусственного горизонта/АКБ, графики, мини-карта, слайдеры PID.
- Семь сценариев на выбор — четыре миссии + три сравнительных эксперимента, с автоматической записью JSON-протокола трассировки.
- Защита от регрессии: 212 модульных тестов, 41 быстрый сквозной тест и отдельные gates для сценарных протоколов, сирот, Firebase/CI, security headers и production-like WebGL render.

**Доказательный контур**:

1. `ScenarioRunner` пишет протокол каждые 100 мс симуляционного времени.
2. В протокол попадают телеметрия, команды автопилота (`pilotActive`, `pilotThrottle`, `pilotTurn`, `pilotBrake`) и события сценария.
3. `verifyScenarioLog()` независимо проверяет сценарные инварианты и добавляет блок `verification`.
4. Командный интерфейс `npm run scenario:verify -- <log.json>` позволяет ИИ-агенту или контуру непрерывной проверки проверить скачанный лог без браузера.
5. `npm run scenario:export` запускает браузерный контур, выгружает PASS-протоколы в [docs/experiments/](docs/experiments/) и при необходимости сам поднимает изолированный Vite на `127.0.0.1:5175`.
6. `npm run scenario:export:check` делает свежий экспорт во временную папку и тут же сверяет восемь логов независимым Node-верификатором.
7. Playwright-тесты прогоняют сценарии и физику в реальном браузере: проверяется verifier, управление, HUD, доступность и то, что fixed-объекты блокируют кинематическое шасси.

---

## Запуск за минуту

Нужен Node.js ≥ 24.15 и npm ≥ 11.12.

```bash
npm install        # ~25 с при тёплом OneDrive
npm run dev        # http://127.0.0.1:5173
# если 5173 занят: npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Откроется сцена. WASD — езда, Space — тормоз, X — сброс позы, R/F — раскрутка/торможение ротора. Справа — панель индикации; вверху списка кнопка «Старт» запустит выбранный сценарий.

---

## Управление и режимы

### Клавиатура (режим «Ручной»)

| Клавиша | Что делает |
|:--------|:-----------|
| **W / ↑** | Газ вперёд |
| **S / ↓** | Газ назад |
| **A / ←** | Поворот влево, yaw уменьшается |
| **D / →** | Поворот вправо, yaw увеличивается |
| **Space** | Тормоз |
| **X** | Сброс позы (вернуть в начало) |
| **R** | Раскрутка ротора |
| **F** | Торможение ротора |

### Камеры

| Кнопка | Что показывает |
|:-------|:----------------|
| **Орбита** | Свободная мышь (по умолчанию) — для презентации |
| **Следом** | Сзади-сверху, плавно идёт за роботом |
| **Спина** | Близко из-за плеча, по продольной оси |
| **Сверху** | Сверху строго вниз |

Камера сглажена через критически-затухающее экспоненциальное демпфирование с раздельными временами полузатухания: позиция 0.18 с, yaw 0.12 с, и мёртвая зона 1.5 мм для подавления дрожания решателя Rapier — поэтому при стоянке робота камера не дрожит.

### Режимы управления

- **Ручной** — клавиатура.
- **FSM** (конечный автомат) — `IDLE → SEARCH → ENGAGE → RECOVERY`. Та же структура, что в прошивке для МК МИК32 «Амур» (целевая платформа реального робота).
- **BT** (дерево поведения) — `selector { Emergency → Engage → Avoid → Patrol }` через DSL Mistreevous.

---

## Сценарии

Сценарии написаны декларативно: создание объектов (React-узел), pilot (автопилот), metric (метрика каждый кадр), goal (предикат завершения), summary (итоговые скаляры). Лог пишется каждые 100 мс симуляционного времени и выгружается одной кнопкой.

После завершения каждый прогон получает блок `verification`: независимая проверка по JSON-протоколу сверяет статус с физическими признаками поведения (`command → motion → progress → goal`). Это защищает от ложного успеха вида «сводка заполнена, но робот стоял». Проверка скачанного лога без браузера:

```bash
npm run scenario:verify -- path/to/1trex-log.json
npm run scenario:analyze -- path/to/1trex-log.json
```

Пакетная выгрузка эталонных протоколов:

```bash
npm run scenario:export
```

Команда сохраняет восемь проверенных прогонов: `obstacleAvoidance`, `searchAndStrike`, `spinnerImpact`, `fsmVsBt-bt`, `fsmVsBt-fsm`, `figureEight`, `madgwickVsComplementary`, `brownoutDischarge`. Если `SIM_URL` не задан и сервер не запущен, скрипт поднимает Vite сам через [scripts/ensure-vite-server.mjs](scripts/ensure-vite-server.mjs), по умолчанию ждёт `http://127.0.0.1:5175/`, выполняет прогоны и затем завершает свой серверный процесс. Быстрая проверка свежести экспортёра:

```bash
npm run scenario:export:check
```

### Базовые миссии

| ID | Название | Что делает |
|:---|:---------|:-----------|
| `figureEight` | Восьмёрка | Автопилот ведёт робота по безопасным waypoint-касательным вокруг двух конусов; метрика сверяет отклонение от эталонной кривой Лиссажу. |
| `obstacleAvoidance` | Объезд препятствий | Слалом от (-3, 0) к (+3, 0) через фиксированные барьеры и боковые габаритные препятствия. Метрика = время + 2 с × N столкновений, verifier требует ноль столкновений и корректные пересечения коридора. |
| `searchAndStrike` | Поиск-и-удар | Цель в случайной точке кольца 3-4 м от старта (детерминирована начальным числом генератора). Робот таранит её ротором. Метрика — t до контакта. |
| `spinnerImpact` | Удар ротором | Робот раскручивает вертикальный ротор, идёт на бронепанель и фиксирует удар только при достаточных оборотах и скорости. |

### Сравнительные эксперименты

| ID | Название | Закрывает в ВКР |
|:---|:---------|:----------------|
| `madgwickVsComplementary` | Маджвик vs Комплементарный фильтр | § 2.1.4 — сравнительная оценка двух алгоритмов оценки ориентации |
| `fsmVsBt` | FSM vs дерево поведения | § 2.2.5 — сравнение двух подходов к автономному управлению |
| `brownoutDischarge` | Brownout-разряд 12S | § 2.1.2 — модель аккумулятора и компенсация просадки напряжения |

Каждый эксперимент при завершении пишет в JSON-лог блок `summary` с конкретными скалярами (RMSE yaw, t до контакта, минимальное напряжение под нагрузкой и т.д.) и блок `verification` с причинами положительного или отрицательного решения. Эти числа идут в таблицы § 3.1 и приложения ВКР.

---

## Что под капотом

### Физика

- **Rapier 3D** (WASM) через `@react-three/rapier`. Фиксированный шаг 1/60 с, восемь итераций solver, явная интерполяция между физ-кадрами для плавности на 120/144 Гц мониторах.
- 4WD skid-steer: 4 колеса на `RevoluteJoint` к шасси с **асимметричными смещениями** (CAD-ниши корпуса не симметричны: передние колёса глубже к центру, задние у самой кормы). Шасси — `kinematicPosition`: скорость интегрируется явно, поза задаётся через `setNextKinematicTranslation/Rotation`, а визуальный угол колёс детерминированно считается из фактической дельты позы после obstacle clamp. Если робот не меняет позицию и yaw, колёса не вращаются даже при удержанном газе в препятствие.
- **Группы столкновений** ([src/physics/collisionGroups.ts](src/physics/collisionGroups.ts)): корпус/колёса/ротор сталкиваются только с ареной, не друг с другом. Шарниры держат части робота вместе, физическая узкая фаза между ними не нужна. Без этого ротор на 7000 об/мин трясёт корпус из-за взаимного проникновения коллайдеров с кронштейнами.
- **Защита кинематического шасси от прохождения сквозь fixed-объекты** ([src/physics/useKinematicObstacleController.ts](src/physics/useKinematicObstacleController.ts)): перед применением движения character controller зажимает translation, а yaw проверяется отдельным cuboid-overlap запросом. Динамические коробки, sensor-зоны и ramp-surface исключаются фильтрами.

### 3D-сцена

- **three.js 0.182** + **@react-three/fiber 9** + **@react-three/drei 10.7** + React 19.2.
- `postinstall` прогоняет `scripts/patch-third-party.mjs`: он переписывает Rapier
  init в non-deprecated `module_or_path`-форму, чтобы runtime и Playwright не
  засорялись предупреждением библиотеки до апстрим-фикса.
- Адаптивный DPR (0.9 ↔ 1.5), shadow-map 1024² (1 каскад), 2 fill-pointLights + hemisphere/ambient — настройка балансирует визуальную атмосферу и FPS на средних ноутбуках. Для Firefox включён `BasicShadowMap` fallback, чтобы не ловить platform-specific WebGL warnings на depth-comparison filtering. Runtime budget проверяет GPU FPS отдельно от SwiftShader/software fallback, потому что CPU WebGL в headless-браузере не отражает плавность реального запуска.
- Скайбокс — процедурный (shader-сфера + 120 звёзд + горизонт-кольца). Никаких HDRI-fetch (это нужно для COOP/COEP, без которых не работает SIMD-WASM Rapier).
- **Корпус / ротор / колесо — три отдельных GLB** (Draco-сжатые: 418 / 139 / 14 КБ), монтируются каждый в своё физическое тело. Колесо — один GLB на 4 экземпляра через drei `<Clone>` (кэш `useGLTF`). Источник — `робот/glb-source/RobotYbiyca_*.glb`, конвейер сжатия — `npm run model:build` (gltf-transform optimize → draco). Грузятся лениво через `<Suspense>`. Переключатель «настоящая модель» / «инженерный заполнитель» в панели индикации.
- Текстовые подписи сцены идут через `troika-three-text`, но worker отключён глобально (`configureTextBuilder({ useWorker: false })`), чтобы CSP оставался строгим: `script-src 'self' 'wasm-unsafe-eval'` без `blob:`.
- Визуальные эффекты урона привязаны к верхней плоскости корпуса, а не к верхней точке GLB-модели: огонь и искры остаются на deck-шасси при любом положении ротора.

### Состояние

- **Zustand 5** — низкочастотное (режим, камера, PID-коэффициенты). По кнопке интерфейса.
- **Valtio 2** — высокочастотная телеметрия (60+ Гц): позиция, скорость, углы, фактические/целевые обороты колёс, состояние АКБ, FSM. Компоненты панели индикации подписываются точечно через `useSnapshot` — нет лишних рендеров.
- **Лог сценария** — отдельный буфер уровня модуля, без zustand-set каждые 100 мс. O(1) push вместо O(N) копирования.

### Панель индикации

Три вкладки, все смонтированы одновременно (`display:none` для неактивных) — uPlot-графики не пересоздаются при переключении.

| Вкладка | Что показывает |
|:--------|:---------------|
| **Полётная** | Спидометр SVG, 4 тахометра, искусственный горизонт, аккумулятор, FSM-состояние, урон арены |
| **Сенсоры** | Графики uPlot за 5 секунд (скорость / yawRate / ток / дальность), мини-карта 8×8 м, raw vs filtered углы |
| **Инженерная** | Слайдеры PID для привода и ротора, обороты ротора, осциллограмма «задание / факт» |

Слева сверху — счётчик FPS (обновляется раз в 500 мс, чтобы не мешать анимации).

---

## Воспроизводимость и V&V

- Доверие к симулятору оформлено по рамке, вдохновлённой **NASA-STD-7009B**, в [docs/ms-credibility.md](docs/ms-credibility.md): назначение, границы применимости, критерии приёмки и долг валидации. (Не «сертификация NASA» — там нет физической калибровки и независимой экспертизы.)
- JSON-логи сценариев содержат `schemaVersion`, `appVersion`, `modelVersion`, `scenarioId`, `seed`, `recordedAt` — достаточно, чтобы пересчитать любую таблицу из ВКР.
- Сценарии используют детерминированный `seed`. `searchAndStrike` больше не зависит от системного времени.
- Панель индикации проходит axe-аудит по WCAG A/AA — это в сквозных тестах.

### Актуальные артефакты

| Артефакт | Где лежит | Как воспроизвести |
|:---------|:----------|:------------------|
| JSON-протоколы 8 прогонов | [docs/experiments/](docs/experiments/) | `npm run scenario:export` |
| Свежий экспорт без записи в docs | временная папка ОС | `npm run scenario:export:check` |
| Независимая проверка протоколов | [scripts/verify-scenario-log.mjs](scripts/verify-scenario-log.mjs) | `npm run scenario:verify -- <файлы из docs/experiments/>` |
| Демонстрационное видео WebM | [docs/video/_recording/](docs/video/_recording/) | `npm run video:record` |
| Демонстрационное видео MP4 | [docs/video/scenarios.mp4](docs/video/scenarios.mp4) | `npm run video:record`, затем команда ffmpeg из [docs/video/README.md](docs/video/README.md) |

Последний контрольный прогон от 21.05.2026: `SIM_E2E_PORT=5176 npm run verify:fast` за **421.4 с** на i7-11800H + RTX 3080 — 212/212 Vitest, scenario:export 8/8 PASS, `hosting:smoke` PASS, e2e:fast 41/41. Пять фаз оркестрации (`scripts/verify-fast.mjs`): статика ×7 → unit+build+scenario logs ×3 → bundle budgets + production-like hosting render → scenario export 297.6 с (serial + retry для детерминизма физики) → Playwright workers=4 95.2 с. Playwright `fullyParallel: true`; Vitest `pool: 'threads'`. Опционально `SIM_E2E_WORKERS=N`, `SIM_EXPORT_PARALLEL=2` (последний — ad-hoc, не для артефактов ВКР). Workload CPU-bound: Rapier WASM SIMD + TS/Vite/JS, поэтому GPU ~10-15% (не блокировка ОС, а лёгкий WebGL).

---

## Для AI-агентов

`CLAUDE.md` играет роль `AGENTS.md` (Linux Foundation/Agentic AI Foundation open standard) — единый манифест для Claude Code, Codex CLI, Cursor, Aider, Copilot, Gemini CLI, Windsurf, Amazon Q. Любой repo-агент стартует с него. [.agents/manifest.json](.agents/manifest.json) — версия 2, валидируется [.agents/manifest.schema.json](.agents/manifest.schema.json) и `npm run agent:check`. TypeScript-as-truth: типы (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) — структура, TSDoc — intent. Public API подмодулей в barrel-файлах [src/control/index.ts](src/control/index.ts), [src/sensors/index.ts](src/sensors/index.ts), [src/autonomy/index.ts](src/autonomy/index.ts), [src/store/index.ts](src/store/index.ts), [src/lib/index.ts](src/lib/index.ts) с TSDoc `@packageDocumentation`. Машинные gates: `npm run agent:check`, `npm run source:check`, `npm run line:check`, `npm run typecheck`, `npm run verify:fast`.

---

## Команды

| Команда | Что делает |
|:--------|:-----------|
| `npm run dev` | Сервер разработки с HMR на `127.0.0.1:5173`; если порт занят: `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort` |
| `npm run build` | TypeScript + релизная сборка → `dist/` |
| `npm run preview` | Локальный просмотр релизной сборки |
| `npm run check` | Biome автофикс + проверка типов |
| `npm run lint` | Biome lint |
| `npm run format` | Biome format |
| `npm run test` | Vitest в режиме наблюдения |
| `npm run test:run` | Vitest один прогон |
| `npm run test:ui` | Интерактивная панель Vitest |
| `npm run test:coverage` | Отчёт покрытия |
| `npm run ci` / `npm run verify` | Полный gate, фазовая параллельная оркестрация: статика (×7) → unit+bench+build+scenario logs (×4) → budgets → scenario export → полная browser-матрица |
| `npm run verify:fast` | Быстрый gate, та же оркестрация без bench и без mobile/firefox/webkit smoke. Эталон: ≈240 с (i7-11800H + RTX 3080) |
| `npm run source:check` | Проверяет рабочие логи, запрещённые suppressions, явный `any`, unused runtime deps и сиротские source-файлы |
| `npm run firebase:check` | Проверяет Firebase headers, PWA manifest, Dependabot и GitHub Actions workflows |
| `npm run hosting:smoke` | Проверяет production-like Firebase headers и факт WebGL-рендера сцены из `dist/` |
| `npx playwright test` | Сквозные тесты + axe/WCAG-аудит (сервер разработки поднимается автоматически) |
| `npm run e2e:fast` | Chromium smoke для cross-env, drive, HUD, experiments и collision-regression |
| `npm run model:build` | Сжимает GLB-исходники из `робот/glb-source/` через gltf-transform draco в `public/models/` |
| `npm run scenario:analyze -- <log.json>` | Сводка по выгруженному JSON-логу |
| `npm run scenario:export` | Прогоняет проверочный шлюз и сохраняет успешные логи в `docs/experiments/`; при необходимости сам поднимает Vite |
| `npm run scenario:export:check` | Экспортирует восемь PASS-логов во временную папку и проверяет их Node-верификатором |
| `npm run scenario:verify -- <log.json>` | Независимая проверка JSON-протокола сценария |
| `npm run video:record` | Записывает демонстрационный WebM через Playwright/Chromium; при необходимости сам поднимает Vite |
| `npm run deploy` | Сборка + публикация на релизный хостинг Firebase |
| `npm run deploy:preview` | Сборка + временный канал предварительного просмотра |

---

## Стэк

- **Vite 8** + **React 19.2** + **React Compiler 1.0** + **TypeScript 6** в строгом режиме
- **three.js 0.182** + **@react-three/fiber 9** + **@react-three/drei 10.7**
- **@react-three/rapier 2.2** (Rapier 0.19, WASM SIMD)
- **Zustand 5** + **Valtio 2**
- **Tailwind CSS 4** + локальные HUD-компоненты (Tabs / Slider / Card)
- **uPlot 1.6** для графиков реального времени
- **Mistreevous 4** для дерева поведения (MDSL DSL)
- **Biome 2.4** — единый линтер+форматтер
- **Vitest 4** (212 unit/regression-тестов) + **Playwright 1** + **axe-core** (41 e2e в fast-наборе)
- **lint-staged 16** — автоматизация `biome check --write` для изменённых файлов

---

## Структура проекта

```
src/
├── physics/        Rapier-обёртки: Robot, Arena, Spinner, FollowCamera,
│                   GLB-модели, kinematics, collisionGroups, kinematic obstacle guard
├── control/        ПИД, мотор, аккумулятор, drivetrain (чистый TypeScript)
├── sensors/        IMU, энкодер, дальномер, фильтры (чистый TS)
├── autonomy/       FSM, дерево поведения
├── hud/            Панель индикации — HudPanel + components/ + tabs/
├── scenarios/      manager + 4 миссии + 3 эксперимента
├── store/          sim-store (zustand) + telemetry (valtio) + scenario-store
├── monitoring/     ErrorBoundary, error/runtime performance monitor
├── offline/        service worker registration
└── theme/          color/data tokens

docs/               документация ВКР: architecture, models, assumptions, experiments, ms-credibility
e2e/                drive, collision, experiments, cross-env, performance — Playwright + axe + проверочный шлюз
public/             модели .glb, draco/decoder, иконки
scripts/            verify, source/Firebase gates, протоколы, видео, GLB, автостарт Vite
```

---

## Замечания по окружению

- Путь содержит **кириллицу + пробелы + OneDrive**. Если `npm install` или `vite dev` ведут себя странно — переезжайте в `c:\Projects\1trex-sim`.
- **OneDrive синхронизация `node_modules`** замедляет установку. Можно отключить: правый клик → «Free up space» либо исключить из синхронизации.
- **PowerShell ≠ bash**: пайп `| tail -25` не работает в PowerShell — там `Select-Object -Last 25`. Кросс-платформенный вариант для playwright: `--reporter=line`.

---

## Деплой на Firebase Hosting

Конфиг в `firebase.json` уже подготовлен: SPA-rewrite, CSP, COOP/COEP (нужны для SIMD-WASM Rapier через `SharedArrayBuffer`), HSTS, Permissions-Policy, immutable cache для моделей/Draco/иконок, `no-cache` для `/`, `index.html`, `sw.js`, manifest, JS/CSS bundles и шрифтов, `application/wasm` MIME. JS/CSS намеренно revalidate-only: если старый HTML запросит уже отсутствующий bundle, Firebase fallback не закрепит HTML как immutable asset. GitHub Actions: `.github/workflows/verify.yml` проверяет проект на Ubuntu/Windows, `.github/workflows/deploy.yml` деплоит на Firebase только вручную или по тегу `release/*`, Dependabot обновляет npm и actions раз в неделю.

```bash
npm install -g firebase-tools && firebase login
cp .firebaserc.example .firebaserc # затем указать projectId
npm run hosting:smoke              # Firebase-like headers + WebGL render
npm run deploy                     # релизный хостинг
npm run deploy:preview             # preview-канал на ~7 дней
```

---

## Команда 1Т

Капитан — Никита Самохин; конструктор — Игорь Курочкин; инженеры — Илья Малинкин, Александр Орлов, Роман Герасимов; медиа-сопровождение и симулятор — Никита Тахиров. Город: Саратов. Представляющая организация: Саратовский ГАУ им. Вавилова. VK команды: <https://vk.com/club231043193>. CAD-исходники: <https://disk.yandex.ru/d/zLGlop7fh50ujg>.

---

## Лицензия

Внутреннее академическое использование (ВКР). Модель и материалы 1T-REX — с ведома команды 1Т.

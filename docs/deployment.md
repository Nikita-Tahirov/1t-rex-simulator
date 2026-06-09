# Развёртывание на Firebase Hosting

## Project

| Параметр | Значение |
|:---------|:---------|
| Project ID | `rex-1t` |
| Project Number | `471816973045` |
| Display Name | `rex-1t` |
| Аккаунт-владелец | `nikita.tahirov@gmail.com` |
| Console | <https://console.firebase.google.com/project/rex-1t/overview> |

## Production URL

| URL | Когда использовать |
|:----|:-------------------|
| <https://rex-1t.web.app> | **Основной** — короткий, в материалы ВКР |
| <https://rex-1t.firebaseapp.com> | альтернативный, эквивалентный |

После каждого `firebase deploy --only hosting` оба URL обновляются одновременно. TLS-сертификат, CDN-кеширование и COOP/COEP-заголовки активируются через ~30 секунд.

## Последний production deploy

| Параметр | Значение |
|:---------|:---------|
| Дата | обновляется автоматически при каждом push в `main` (auto-deploy с 2026-05-22) |
| Канал | `live` |
| Hosting URL | <https://rex-1t.web.app> |
| Release user | `nikita.tahirov@gmail.com` |
| Состав | drive PID на body level ([robotBodyPid.ts](../src/physics/robotBodyPid.ts)), spinner P-loop через joint motor factor от UI-gains, обновлённая инженерная панель с ползунками 0..3 |

## Конфигурация ([firebase.json](../firebase.json))

| Параметр | Значение | Зачем |
|:---------|:---------|:------|
| `public` | `dist` | Vite собирает сюда |
| `rewrites` | `**` → `/index.html` | SPA-роутинг |
| `Cross-Origin-Opener-Policy` | `same-origin` | разрешает SharedArrayBuffer |
| `Cross-Origin-Embedder-Policy` | `require-corp` | требуется для SIMD-WASM Rapier |
| `Content-Security-Policy` | `default-src 'self'` + WASM allowance | закрывает XSS/embedding surface без внешних ассетов |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HTTPS-only для custom domains |
| `Permissions-Policy` | camera/geolocation/microphone/payment/etc. off | браузерные capabilities не нужны симулятору |
| `Content-Type` (`*.wasm`) | `application/wasm` | браузер исполняет WASM напрямую |
| `Cache-Control` (`/models`, `/draco`, favicon/icons.svg) | `public, max-age=31536000, immutable` | стабильные хешированные ассеты → вечный кэш |
| `Cache-Control` (`/assets`, `/fonts`) | `no-cache` | SPA-fallback: старый HTML не должен закэшировать уже отсутствующий bundle |
| `Cache-Control` (`index.html`) | `no-cache` | всегда свежий manifest chunks |

`.firebaserc` содержит alias `default → rex-1t`. Файл в `.gitignore` — ∀ разработчиков свой.

Конфигурация защищена gate-ом `npm run firebase:check`: он проверяет headers,
SPA rewrite, manifest, Dependabot и оба GitHub Actions workflow.

## GitHub Actions

| Workflow | Триггер | Что делает |
|:--|:--|:--|
| `.github/workflows/verify.yml` | PR и push в `main/master` | `npm audit --audit-level=high` + полный `npm run verify` на Ubuntu (matrix сокращён до ubuntu-only 2026-05-22; Windows проверяется автором локально — на shared runner verify > 45 мин → timeout) |
| `.github/workflows/deploy.yml` | push в `main` (auto-production), `workflow_dispatch` (preview/production) или тег `release/*` | build + budgets + Firebase Hosting deploy |
| `.github/dependabot.yml` | еженедельно | PR для npm и GitHub Actions обновлений |

Оба workflow держат `permissions: contents: read`. Деплойные секреты живут
только в GitHub environments `firebase-preview` и `firebase-production`:

- `FIREBASE_SERVICE_ACCOUNT` — JSON service-account, созданный Firebase Hosting GitHub integration.
- `FIREBASE_PROJECT_ID` — Firebase project id (`rex-1t` для текущего проекта).

Локальные tooling-переменные описаны в [.env.example](../.env.example). Клиентских
`VITE_*` переменных нет: по правилам Vite они попадают в bundle и не подходят для секретов.

## Команды

### Первый раз (один раз на машину)

```powershell
cd "путь_до_симулятора"
npx firebase-tools login                    # OAuth Google
npx firebase-tools use --add                # выбрать rex-1t, alias=default
```

### Релизная публикация

```powershell
npm run deploy
# эквивалентно: npm run build && npx firebase-tools deploy --only hosting
```

После завершения CLI печатает `Hosting URL: https://rex-1t.web.app`.

### Канал предварительного просмотра (временный URL для демо ВКР, 7 дней)

```powershell
npm run deploy:preview
# эквивалентно: npm run build && npx firebase-tools hosting:channel:deploy preview
```

URL вида `https://rex-1t--preview-xxxxxxxx.web.app`. Не затрагивает прод.

### Откат

```powershell
npx firebase-tools hosting:rollback
```

Возвращает предыдущую версию (Firebase хранит до 10 последних релизов).

## Размеры ресурсов (контрольная сборка, 2026-05-15)

| Файл | Размер | Gzip |
|:-----|-------:|-----:|
| `vendor-rapier-core-*.js` | 4471 КБ | 1685 КБ |
| `vendor-misc-*.js` (three.js + остальное) | 888 КБ | 240 КБ |
| `vendor-r3f-drei-*.js` | 230 КБ | 72 КБ |
| `vendor-react-dom-*.js` | 178 КБ | 56 КБ |
| `vendor-uplot-*.js` (lazy) | 51 КБ | 22 КБ |
| `vendor-bt-*.js` | 47 КБ | 10 КБ |
| `index-*.js` (entry) | 174 КБ | 57 КБ |
| `vendor-rapier-r3f-*.js` | 24 КБ | 8 КБ |
| `SensorsTab-*.js` (lazy) | 7.5 КБ | 3.3 КБ |
| `EngineeringTab-*.js` (lazy) | 6.2 КБ | 2.7 КБ |
| `createRafSampler-*.js` (lazy shared helper) | 2.2 КБ | 1.1 КБ |
| `vendor-state-*.js` | 2.3 КБ | 1.2 КБ |
| `ScenarioWrapper-*.js` (lazy) | 1.2 КБ | 0.6 КБ |
| `rolldown-runtime-*.js` | 0.7 КБ | 0.4 КБ |
| `vendor-react-*.js` | 0.3 КБ | 0.2 КБ |
| `index-*.css` (Tailwind 4) | 27.2 КБ | 6.3 КБ |
| **Итого JS gzip по budget gate** | | **2080.8 КБ из 2100** |
| `models/1trex-corpus.glb` (Draco) | 418 КБ | n/a |
| `models/1trex-spinner.glb` (Draco) | 139 КБ | n/a |
| `models/1trex-wheel.glb` (Draco) | 14 КБ | n/a |
| `draco/draco_decoder.wasm` (self-host) | 192 КБ | n/a |
| `draco/draco_decoder.js` | 512 КБ | n/a |

Lazy chunks (`SensorsTab`, `EngineeringTab`, `ScenarioWrapper`, `vendor-uplot`) грузятся **только при первом обращении** — холодный старт лёгкий.

## Лимиты Firebase Spark (бесплатный план)

| Лимит | Значение | Текущая нагрузка |
|:------|:---------|:-----------------|
| Storage | 10 ГБ | < 10 МБ ✓ |
| Transfer / day | 360 МБ | ≈ 5 МБ за уникального посетителя → ≈ 70 заходов/сутки |
| Custom domain | 1 | — |
| Каналы предварительного просмотра | без ограничения | — |

При риске превысить — переход на **Blaze** (pay-as-you-go), $0–5/мес. при умеренной нагрузке.

## Известные риски релизной среды

1. **COOP/COEP блокирует cross-origin ассеты**. Решение: ∀ внешних URL → self-host. Уже сделано для DRACO decoder ([public/draco/](../public/draco/)).
2. **WASM 4.5 МБ в JS-base64** (`@dimforge/rapier3d-compat`). Альтернатива — `@dimforge/rapier3d` (нативный `.wasm`), но требует top-level await + Vite 8/rolldown пока не поддерживает. Ждём апдейт rolldown.
3. **Rapier init warning** пока гасится воспроизводимым `postinstall`-патчем (`scripts/patch-third-party.mjs`) до апстрим-фикса в `@react-three/rapier` / `@dimforge/rapier3d-compat`.
4. **OneDrive sync** в директории разработки замедляет `npm run deploy`. Решение: правый-клик `node_modules` → «Free up space».

## Проверка перед публикацией

Перед релизной публикацией:

```powershell
npm run verify
```

Ожидаемое состояние:

- `npm run verify` → Biome, ESLint, agent infra, typecheck, line/source/Firebase checks, unit/regression-тесты, bench, build, budgets, fresh scenario export, 8/8 scenario logs, Playwright.
- `npm run build` внутри verify → без CSS/chunk warnings; тяжёлый `vendor-rapier-core` осознанно вынесен в отдельный chunk.
- `npx playwright test` внутри verify → axe/WCAG-аудит, проверки камеры `Спина`, автопилот семи сценариев, runtime FPS и cross-env smoke.
- Для M&S-результатов использовать только JSON-логи со `schemaVersion`, `modelVersion`, `scenarioId`, `seed`.

## Чек-лист «работает в релизной среде»

После каждого `npm run deploy` открыть <https://rex-1t.web.app> и проверить:

- [ ] `Console` пуст (нет красных ошибок)
- [ ] 3D-модель 1T-REX загружается (фиолетовый PBR-цвет)
- [ ] WASD двигает робота, спидометр > 5 м/с
- [ ] A/D + W → робот едет лицом вперёд (forward через `applyQuaternion`)
- [ ] Вкладки панели «Сенсоры»/«Инженерная» подгружаются при клике (network → отдельные `*.js`)
- [ ] Сценарий «Восьмёрка» запускается, лог скачивается
- [ ] DRACO decoder загружается из `/draco/`, не из `gstatic.com`

При любом ❌ — диагностика через `curl -I https://rex-1t.web.app/<asset>` ∧ `firebase.json`.

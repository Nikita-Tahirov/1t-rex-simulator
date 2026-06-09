# Сетевой режим (PvP до 4 игроков)

Отдельный совместный режим: комната → лобби → бой на большой арене → результат.
Одиночная игра и тренировочные сценарии не затронуты — сетевой код и Firebase
грузятся лениво только при входе в режим (кнопка «Сетевой бой»).

## Архитектура: порт + два адаптера

UI и синхронизация зависят только от интерфейса [`NetworkPort`](../src/netgame/net/NetworkPort.ts).
Две реализации:

- **`inMemoryAdapter`** — без бэкенда. Комнаты живут в памяти; вкладки одного
  браузера синхронизируются через `BroadcastChannel`. Это рабочий мультиплеер
  «на одной машине» (открыть 2–4 вкладки) — **дефолт**, поэтому продакшен играбелен
  сразу, и основа для unit/e2e без сети.
- **`firebaseAdapter`** — Firebase Realtime Database + Anonymous Auth для
  кросс-девайс игры. Включается, когда заданы `VITE_FIREBASE_*` (см. `.env.example`).
  Грузится отдельным lazy-чанком `vendor-firebase`.

Выбор адаптера — [`resolveAdapterKind`](../src/netgame/net/firebaseConfig.ts):
`VITE_NET_ADAPTER=memory|firebase` или авто (firebase при наличии config, иначе memory).
При сбое инициализации Firebase — мягкая деградация до in-memory.

## Модель авторитетности

Без отдельного игрового сервера: **каждый клиент авторитетен над своим роботом**
(поза + здоровье), удалённые роботы интерполируются. Небольшие расхождения
столкновений между клиентами допустимы.

- Локальный робот ведётся аркадной кинематикой ([`battleArcade`](../src/physics/battle/battleArcade.ts)),
  клампится к стенам и расталкивается с соперниками вручную; урон считается по
  **скорости сближения** (симметрично у обоих → честно при self-authoritative здоровье)
  через существующую модель [`robotDamage`](../src/physics/robotDamage.ts).
- Поза локального робота пишется в `telemetry` → камера и датчик прочности работают
  переиспользованием. Публикуется в сеть ~12 Гц ([`usePublishLocalState`](../src/netgame/sync/usePublishLocalState.ts)).
- Удалённые роботы — интерполяция таймстемпленных снимков «в прошлом» на ~120 мс
  ([`useRemoteRobots`](../src/netgame/sync/useRemoteRobots.ts), [`interpolation`](../src/netgame/sync/interpolation.ts)).
- Исход боя считают все одинаково ([`computeWinner`](../src/netgame/net/match.ts)),
  но финал в `meta` пишет ровно host (транзакцией). Затянувшийся бой завершает
  страховочный таймер по наибольшему здоровью.

## Дерево данных (RTDB и in-memory идентичны по смыслу)

```
roomsIndex/$roomId            — лёгкая витрина для общего списка комнат (host пишет)
rooms/$roomId/meta            — host-авторитетные метаданные (статус, arenaSeed, углы, winner)
rooms/$roomId/players/$uid    — кто в комнате (пишет только свой $uid)
rooms/$roomId/states/$uid     — горячая поза/здоровье ~12 Гц (пишет только свой $uid)
```

Внешний JSON всегда нормализуется на границе ([`snapshotMapping`](../src/netgame/net/snapshotMapping.ts)).
Правила безопасности — [`database.rules.json`](../database.rules.json): только
аутентифицированные; запись своих узлов по `$uid === auth.uid`; host пишет `meta`
(с такеовером при пропаже host); валидация формы.

## Жизненный цикл

создание комнаты → отображение в списке → вход → лобби (готовность) → host
«Начать бой» (фикс `arenaSeed`, назначение углов 0..3 = цвета) → 3-сек отсчёт →
бой (обмен позами/здоровьем, столкновения, урон) → остаётся один → `finished` +
`winnerId` → экран результата (реванш / в список / в одиночную).

Presence: in-memory — явный выход + `pagehide`; Firebase — `onDisconnect`
(удаление `players/$uid` и `states/$uid` при обрыве). Выход host передаёт роль
старшему по времени входа.

## Большая арена

Боевая арена — 36×36 м (вдвое больше одиночной 18 м), только в сетевом режиме.
Размер прокидывается через `ArenaSizeProvider`/`useArenaSize`; константа `ARENA.size`
не мутируется (её фиксирует `arenaData.test.ts`). Робот остаётся прежнего размера.

## Оптимизация и совместимость (все устройства / бюджетные ноутбуки)

Боевая сцена НЕ участвует в `scenario:export`, поэтому здесь применимо адаптивное
качество (в одиночке оно отключено ради детерминизма физики). См.
[`battleQuality`](../src/netgame/battle/battleQuality.ts):

- **Стартовый уровень по устройству** (лёгкая эвристика, без тяжёлой detect-gpu):
  мобильные/малоядерные — тени off, DPR 1, antialias off; десктоп — тени 1024²
  (бой, не слайды), DPR до 1.25.
- **Адаптивный DPR** через drei `PerformanceMonitor` по реальному FPS; при сильной
  просадке — `onFallback` гасит тени и роняет DPR до 0.6. Resolution — главная статья
  fill-rate, тени — главная статья GPU.
- **Firefox** — `BasicShadowMap` вместо PCFSoft; `Preload all` убирает первый стуттер.
- **Мобильные** — тач-управление (`OnScreenControls`) в бою (синтетические клавиши →
  единый input-path, как в одиночке).
- Роботы — чисто визуальные (без Rapier-симуляции), ≤~40 draw-call, draco-GLB.

Браузеры: BroadcastChannel (in-memory) поддержан в современных Chrome/Firefox/Safari
(адаптер мягко деградирует, если его нет); Firebase SDK — везде. COOP/COEP нужны
Rapier WASM (заданы в `firebase.json`).

**Кросс-девайс (разные пользователи/устройства) работает ТОЛЬКО через Firebase** —
требует Console-настройки и `VITE_FIREBASE_*` (см. ниже). Без них доступен
мультиплеер в нескольких вкладках одного браузера (in-memory).

## Включение Firebase (кросс-девайс) — ручные шаги

Бесплатный план Spark (без карты): RTDB и Anonymous Auth доступны; Firestore не
используем (лимит 20K записей/день мал для частых поз).

1. Firebase Console → проект → Build → **Realtime Database** → Create (регион,
   напр. europe-west1) → start in locked mode.
2. Build → **Authentication** → Sign-in method → включить **Anonymous**.
3. Project settings → Your apps → **Add app → Web** → скопировать config.
4. Заполнить `VITE_FIREBASE_*` в `.env` (см. `.env.example`).
5. Задеплоить правила: `firebase deploy --only database` (или вставить
   `database.rules.json` в Console → Realtime Database → Rules).

Без этих шагов приложение использует in-memory адаптер (мультиплеер в нескольких
вкладках) — это полностью рабочий режим для локального демо/защиты.

## Тесты

- Unit (без сети): `match`, `lobby`, `battleArcade`, `spawnPoints`, `interpolation`,
  `snapshotMapping`, `inMemoryAdapter`, `netRoomStore`.
- E2E (`e2e:net`, in-memory, несколько вкладок): полный поток
  ([netgame.spec](../e2e/netgame.spec.ts)) и стресс — 3 игрока, выход host, реванш
  ([netgame-stress.spec](../e2e/netgame-stress.spec.ts)).

Firebase-путь (cross-device) не покрыт e2e локально — требует Console-настройки и
реального проекта; логика-граница (`snapshotMapping`, `match`) покрыта unit-тестами.

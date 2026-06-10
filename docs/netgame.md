# Сетевой режим (PvP до 4 игроков)

Отдельный совместный режим: комната → лобби → бой на большой арене → результат.
Одиночная игра и тренировочные сценарии не затронуты — сетевой код и Firebase
грузятся лениво только при входе в режим (кнопка «Сетевой бой»).

## Архитектура: порт + два адаптера

UI и синхронизация зависят только от интерфейса [`NetworkPort`](../src/netgame/net/NetworkPort.ts).
Две реализации:

- **`firebaseAdapter`** — Firebase Realtime Database + Anonymous Auth для
  кросс-девайс игры (разные браузеры/устройства видят общий список комнат и
  бьются друг с другом). **Дефолт**: публичный config проекта `rex-1t` зашит в
  [`firebaseConfig`](../src/netgame/net/firebaseConfig.ts), поэтому продакшен
  кросс-девайс играбелен из коробки. Грузится отдельным lazy-чанком `vendor-firebase`.
- **`inMemoryAdapter`** — без бэкенда. Комнаты живут в памяти; вкладки одного
  браузера синхронизируются через `BroadcastChannel`. Включается явно
  `VITE_NET_ADAPTER=memory` — основа для unit/e2e без сети и офлайн-разработки.
  Также сюда мягко деградирует firebase-путь при сбое инициализации.

Выбор адаптера — [`resolveAdapterKind`](../src/netgame/net/firebaseConfig.ts):
`VITE_NET_ADAPTER=memory|firebase` или авто (config всегда есть → firebase).
`VITE_FIREBASE_*` нужны только для форка на собственный проект.

## Решение (план, 2026-06): эволюция к rigid-body физике боя

Текущий бой — кинематический (см. ниже). Принято решение эволюционировать его к
реалистичной rigid-body физике (наезды/заклинивание, контакт ротора, инерция
95 кг, опрокидывание) из реальных ТТХ. Архитектурный выбор зафиксирован после
web-исследования (Gaffer On Games, Photon Fusion, Valve, Rapier docs):

- **Транспорт — остаётся Firebase RTDB, без WebRTC и без игрового сервера.** WebRTC
  окупается только в host-authoritative модели (фактически сервер на клиенте, что
  план запрещает); лишнюю задержку релея прячет буфер интерполяции. Бесплатный
  GCP-компьют (e2-micro / Cloud Run) под авторитетный real-time game-loop не
  тянет (1 ГБ/мес egress, 60-мин лимит Cloud Run, single-region латентность).
- **Модель — Gaffer-style STATE SYNCHRONIZATION + per-client authority.** Каждый
  клиент локально симулирует Rapier-тела ВСЕХ роботов; свой — авторитетно
  (импульсы/моторы от ввода), чужие — динамические тела, **жёстко защёлкиваемые**
  (`setTranslation/Rotation/Linvel/Angvel`) в присланную позу. **Сглаживать только
  визуальный меш** (затухающий error-offset), НИКОГДА само физ-тело.
- **Lockstep/rollback — нет.** Детерминированная сборка Rapier отключает SIMD
  (нужный телефонам), а своя f32-логика всё равно разойдётся cross-browser.
- **Контакт двух владельцев** — authority-transfer по `min(uid)` (пару считает один
  пир и публикует результат), урон — через Rapier contact-события в существующий
  `dealt`/`incomingDelta`. Расхождения на сильных ударах приняты как design-решение.
- **Производительность** — SIMD-сборка Rapier, raycast-vehicle вместо 4 колёс-тел,
  convex-hull шасси, фикс-тик (1/60 десктоп, 1/30 мобила), сон тел, и
  **адаптивная деградация на текущую кинематику при низком FPS** (она остаётся
  fallback). Внедрение поэтапное на ветке `feat/battle-rigid-physics`.

## Модель авторитетности (текущая, кинематическая)

Без отдельного игрового сервера: **каждый клиент авторитетен над своим роботом**
(поза + здоровье), удалённые роботы интерполируются. Небольшие расхождения
столкновений между клиентами допустимы.

- Локальный робот ведётся аркадной кинематикой ([`battleArcade`](../src/physics/battle/battleArcade.ts)),
  клампится к стенам и расталкивается с соперниками вручную. Спиннер управляется R/F
  (разгон/торможение оборотов, как в одиночке).
- **Урон наносит АТАКУЮЩИЙ, применяет ЖЕРТВА** ([`battleCombat`](../src/physics/battle/battleCombat.ts)):
  таран считается по СВОЕЙ скорости сближения (`approachSpeed` — стоящий не бьёт сам
  себя), спиннер — во фронтальном секторе при достаточных оборотах. Нанесённый урон
  копится в `dealt[victimUid]` и едет в состоянии; жертва применяет ДЕЛЬТУ к своему HP
  ([`useIncomingDamage`](../src/netgame/sync/useIncomingDamage.ts)). Это чинит асимметрию
  интерполяции (атакующий надёжно детектит контакт) и переживает потерю пакетов (нужно
  лишь последнее значение счётчика). Здоровье остаётся self-authoritative; стены бьют
  сам себя через [`robotDamage`](../src/physics/robotDamage.ts).
- Поза/обороты локального робота пишутся в `telemetry` → камера и датчик прочности
  работают переиспользованием. Публикуется в сеть до 12 Гц с throttle по изменению
  ([`usePublishLocalState`](../src/netgame/sync/usePublishLocalState.ts)).
- Удалённые роботы — интерполяция снимков «в прошлом» в **локальном времени получателя**
  (`performance.now()` на приёме, а НЕ `Date.now()` отправителя — часы клиентов не
  синхронизированы, и сравнение чужого времени со своим ломало интерполяцию). При
  пропуске пакетов поза коротко экстраполируется, затем замирает
  ([`useRemoteRobots`](../src/netgame/sync/useRemoteRobots.ts), [`interpolation`](../src/netgame/sync/interpolation.ts)).
- Исход боя считают все одинаково ([`computeWinner`](../src/netgame/net/match.ts)),
  но финал в `meta` пишет ровно host (транзакцией). Затянувшийся бой завершает
  страховочный таймер по наибольшему здоровью.

## Дерево данных (RTDB и in-memory идентичны по смыслу)

```
roomsIndex/$roomId            — лёгкая витрина для общего списка комнат (host пишет)
rooms/$roomId/meta            — host-авторитетные метаданные (статус, arenaSeed, углы, winner)
rooms/$roomId/players/$uid    — кто в комнате (пишет только свой $uid)
rooms/$roomId/states/$uid     — горячая поза/обороты/здоровье + dealt (урон соперникам), ≤12 Гц
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

**Кросс-девайс (разные пользователи/устройства) работает через Firebase** и
включён по умолчанию (config проекта `rex-1t` зашит). План Spark (без карты):
RTDB + Anonymous Auth бесплатны; Firestore не используем (лимит 20K записей/день
мал для частых поз).

## Инфраструктура проекта rex-1t (уже настроено)

- **Realtime Database** — инстанс `rex-1t-default-rtdb` в `europe-west1`, ACTIVE.
- **Anonymous Auth** — включён в Firebase Console (первичная активация на Spark
  делается только кликом в Console; провайдеры потом — через Admin API).
- **Web app** — зарегистрирован; публичный config зашит в `firebaseConfig.ts`.
- **Правила БД** — `database.rules.json` задеплоены в RTDB (REST PUT
  `/.settings/rules.json`, т.к. `firebase deploy` под запретом dev-настроек).

## Форк на собственный Firebase-проект

1. Console → Build → **Realtime Database** → Create (регион) → locked mode.
2. Build → **Authentication** → Sign-in method → включить **Anonymous**.
3. Project settings → Your apps → **Add app → Web** → скопировать config.
4. Заполнить `VITE_FIREBASE_*` в `.env` (override дефолта rex-1t).
5. Задеплоить `database.rules.json` в свой RTDB (Console → Rules или REST).

Для офлайн-разработки/e2e — `VITE_NET_ADAPTER=memory` (мультиплеер в нескольких
вкладках одного браузера, без сети).

## Тесты

- Unit (без сети): `match`, `lobby`, `battleArcade`, `spawnPoints`, `interpolation`,
  `snapshotMapping`, `inMemoryAdapter`, `netRoomStore`.
- E2E (`e2e:net`, in-memory, несколько вкладок): полный поток
  ([netgame.spec](../e2e/netgame.spec.ts)) и стресс — 3 игрока, выход host, реванш
  ([netgame-stress.spec](../e2e/netgame-stress.spec.ts)).

Firebase-путь (cross-device) не покрыт e2e локально — требует Console-настройки и
реального проекта; логика-граница (`snapshotMapping`, `match`) покрыта unit-тестами.

/// <reference types="vite/client" />

/**
 * Типизация клиентских env-переменных Vite для сетевого режима. Все опциональны:
 * без них приложение использует in-memory адаптер (мультиплеер в нескольких
 * вкладках). Значения — ПУБЛИЧНЫЕ идентификаторы Firebase web-app (не секреты):
 * безопасность обеспечивают `database.rules.json` + Anonymous Auth, а не их
 * сокрытие. См. `docs/netgame.md` и `.env.example`.
 */
interface ImportMetaEnv {
  /** Принудительный выбор транспорта: `memory` | `firebase`. По умолчанию авто. */
  readonly VITE_NET_ADAPTER?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_DATABASE_URL?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

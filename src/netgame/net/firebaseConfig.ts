/**
 * Публичный web-config Firebase. Это НЕ секреты — публичные идентификаторы
 * web-приложения (apiKey и пр. видны в любом Firebase-клиенте); безопасность
 * обеспечивают `database.rules.json` + Anonymous Auth, а не скрытность config.
 *
 * По умолчанию подставляется config production-проекта `rex-1t`, поэтому
 * кросс-девайс мультиплеер работает «из коробки» (общий список комнат и бой
 * между разными браузерами/устройствами). Любое из `VITE_FIREBASE_*` env
 * переопределяет дефолт целиком — это путь для форка на собственный проект.
 * Явный `VITE_NET_ADAPTER=memory` принудительно отключает сеть (in-memory,
 * мультиплеер в нескольких вкладках одного браузера) — так гоняются e2e.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

/**
 * Публичный config проекта `rex-1t` (Firebase Hosting `rex-1t.web.app`).
 * RTDB-инстанс `europe-west1`; Anonymous Auth включён в Firebase Console.
 */
const DEFAULT_FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: 'AIzaSyC5_rlOlL1GRQe-K9H90zNoAgctms52tFA',
  authDomain: 'rex-1t.firebaseapp.com',
  databaseURL: 'https://rex-1t-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'rex-1t',
  appId: '1:471816973045:web:0584737573e3a7d54033bc',
};

export function getFirebaseConfig(): FirebaseWebConfig | null {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const databaseURL = env.VITE_FIREBASE_DATABASE_URL;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  // Полный env-override (форк на свой проект) только если заданы все три якоря;
  // иначе — публичный дефолт rex-1t.
  if (apiKey && databaseURL && projectId) {
    return {
      apiKey,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
      databaseURL,
      projectId,
      appId: env.VITE_FIREBASE_APP_ID ?? '',
    };
  }
  return DEFAULT_FIREBASE_CONFIG;
}

/**
 * Какой транспорт использовать: явный `VITE_NET_ADAPTER` (memory|firebase) или
 * авто. Config теперь всегда есть (дефолт rex-1t) → авто = firebase; e2e и
 * офлайн-разработка форсируют memory через `VITE_NET_ADAPTER=memory`.
 */
export function resolveAdapterKind(): 'memory' | 'firebase' {
  const explicit = import.meta.env.VITE_NET_ADAPTER;
  if (explicit === 'memory') return 'memory';
  if (explicit === 'firebase') return 'firebase';
  return getFirebaseConfig() ? 'firebase' : 'memory';
}

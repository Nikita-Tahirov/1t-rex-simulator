/**
 * Публичный web-config Firebase из env Vite. Это НЕ секреты — публичные
 * идентификаторы web-приложения; безопасность обеспечивают `database.rules.json`
 * + Anonymous Auth. Если обязательные поля не заданы, возвращаем null →
 * приложение использует in-memory адаптер (мультиплеер в нескольких вкладках).
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

export function getFirebaseConfig(): FirebaseWebConfig | null {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const databaseURL = env.VITE_FIREBASE_DATABASE_URL;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !databaseURL || !projectId) return null;
  return {
    apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    databaseURL,
    projectId,
    appId: env.VITE_FIREBASE_APP_ID ?? '',
  };
}

/** Какой транспорт использовать: явный `VITE_NET_ADAPTER` или авто по наличию config. */
export function resolveAdapterKind(): 'memory' | 'firebase' {
  const explicit = import.meta.env.VITE_NET_ADAPTER;
  if (explicit === 'memory') return 'memory';
  if (explicit === 'firebase') return 'firebase';
  return getFirebaseConfig() ? 'firebase' : 'memory';
}

import { type FirebaseApp, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { type Database, getDatabase } from 'firebase/database';
import type { FirebaseWebConfig } from './firebaseConfig.ts';

/**
 * Ленивая инициализация Firebase: app + Anonymous Auth + Realtime Database.
 *
 * Этот модуль (и весь Firebase SDK) попадает в отдельный lazy-чанк и грузится
 * ТОЛЬКО когда выбран firebase-адаптер — основной bundle одиночки не тяжелеет.
 * Anonymous Auth даёт стабильный uid без логина; правила RTDB разрешают писать
 * только свои узлы по этому uid.
 */

export interface FirebaseHandles {
  app: FirebaseApp;
  db: Database;
  uid: string;
}

let handlesPromise: Promise<FirebaseHandles> | null = null;

export function getFirebaseHandles(config: FirebaseWebConfig): Promise<FirebaseHandles> {
  if (!handlesPromise) handlesPromise = init(config);
  return handlesPromise;
}

async function init(config: FirebaseWebConfig): Promise<FirebaseHandles> {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const credential = await signInAnonymously(auth);
  const db = getDatabase(app);
  return { app, db, uid: credential.user.uid };
}

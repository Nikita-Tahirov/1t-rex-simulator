import { deleteApp, type FirebaseApp, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { type Database, forceLongPolling, getDatabase, onValue, ref } from 'firebase/database';
import type { FirebaseWebConfig } from './firebaseConfig.ts';

/**
 * Ленивая инициализация Firebase: app + Anonymous Auth + Realtime Database.
 *
 * Этот модуль (и весь Firebase SDK) попадает в отдельный lazy-чанк и грузится
 * ТОЛЬКО когда выбран firebase-адаптер — основной bundle одиночки не тяжелеет.
 * Anonymous Auth даёт стабильный uid без логина; правила RTDB разрешают писать
 * только свои узлы по этому uid.
 *
 * Транспортный фолбэк: в сетях, где WebSocket к `*.firebasedatabase.app`
 * режется (DPI/корп-прокси/блокировщик), SDK НЕ переходит на long-polling сам —
 * при «чёрной дыре» WSS `.info/connected` не наступает даже за 75 с (проверено
 * экспериментально 2026-06-12). Поэтому: если за грейс-период соединения нет,
 * стек пересобирается с `forceLongPolling()` — он ходит обычным HTTPS и
 * переживает такие сети. Цена для здоровых сетей — ноль (WSS успевает за ~1 с).
 */

export interface FirebaseHandles {
  app: FirebaseApp;
  db: Database;
  uid: string;
}

/** Сколько ждать `connected=true` на websocket-транспорте до фолбэка. */
const WS_CONNECT_GRACE_MS = 7_000;

let handlesPromise: Promise<FirebaseHandles> | null = null;

export function getFirebaseHandles(config: FirebaseWebConfig): Promise<FirebaseHandles> {
  if (!handlesPromise) handlesPromise = init(config);
  return handlesPromise;
}

/**
 * Дождаться первого `true` от подписки либо истечения таймаута.
 * Чистая обвязка (тестируется без Firebase): отписка гарантирована в обоих
 * исходах, поздние коллбэки после решения игнорируются.
 */
export function waitForFirstTrue(
  subscribe: (callback: (value: boolean) => void) => () => void,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // unsubscribe может быть ещё не присвоен, если callback синхронный.
      queueMicrotask(() => unsubscribe());
      resolve(value);
    };
    const timer = setTimeout(() => settle(false), timeoutMs);
    const unsubscribe = subscribe((value) => {
      if (value) settle(true);
    });
  });
}

function waitConnected(db: Database, timeoutMs: number): Promise<boolean> {
  return waitForFirstTrue(
    (callback) => onValue(ref(db, '.info/connected'), (snap) => callback(snap.val() === true)),
    timeoutMs,
  );
}

/** Один прогон app+auth+db. Анонимный uid персистентен (IndexedDB origin'а). */
async function connect(config: FirebaseWebConfig): Promise<FirebaseHandles> {
  const app = initializeApp(config);
  const auth = getAuth(app);
  // После пересоздания app юзер восстанавливается из persistence асинхронно;
  // без ожидания signInAnonymously успел бы создать НОВОГО анонима (другой uid).
  await auth.authStateReady();
  const uid = auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid;
  return { app, db: getDatabase(app), uid };
}

async function init(config: FirebaseWebConfig): Promise<FirebaseHandles> {
  const first = await connect(config);
  if (await waitConnected(first.db, WS_CONNECT_GRACE_MS)) return first;
  // WSS не установился за грейс — вероятно, сеть его режет. Пересборка на
  // long-polling; итоговое состояние соединения UI увидит через watchConnected.
  await deleteApp(first.app).catch(() => {
    // Снос «висящего» app — best-effort: повторный initializeApp ниже всё
    // равно единственный путь, а упасть здесь значит остаться без фолбэка.
  });
  forceLongPolling();
  return connect(config);
}

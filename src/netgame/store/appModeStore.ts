import { create } from 'zustand';
import { useNetRoomStore } from './netRoomStore.ts';

/**
 * Стор верхнего уровня: какой режим приложения активен.
 *
 * `solo` — обычный одиночный симулятор и тренировочные сценарии (поведение по
 * умолчанию, байт-в-байт как прежде). `net` — отдельный сетевой PvP-режим,
 * который монтируется лениво (`NetGameRoot`) и в `solo` не загружается вовсе:
 * ни Firebase, ни сетевые запросы. Это сохраняет одиночные e2e/проверки зелёными.
 *
 * Высокочастотного состояния здесь нет — только редкие переключения экранов по
 * действиям пользователя, поэтому zustand (как `useSimStore`), не valtio.
 */

export type AppMode = 'solo' | 'net';

/** Экран сетевого режима. `menu` — стартовый, `rooms` — список комнат,
 *  `lobby` — комната ожидания, `battle` — идёт бой, `result` — итог. */
export type NetScreen = 'menu' | 'rooms' | 'lobby' | 'battle' | 'result';

export interface AppModeState {
  appMode: AppMode;
  netScreen: NetScreen;
  /**
   * Кадр «заморозки» solo-RAF перед размонтажом одиночной сцены. Пока `true`,
   * `App` рендерит `<Canvas frameloop="never">` → useFrame'ы (включая шаг Rapier)
   * не выполняются, и последующий unmount не дёргает уже освобождённый WASM-мир.
   */
  leavingSolo: boolean;
  /** Шаг 1 входа в сеть: заморозить solo-RAF (фактический переход — `enterNet`). */
  requestEnterNet: () => void;
  /** Шаг 2: войти в сетевой режим (открывает стартовое меню сети). */
  enterNet: () => void;
  /** Вернуться в одиночную игру (размонтирует сетевой оверлей). */
  exitNet: () => void;
  setNetScreen: (screen: NetScreen) => void;
}

export const useAppModeStore = create<AppModeState>()((set) => ({
  appMode: 'solo',
  netScreen: 'menu',
  leavingSolo: false,
  // Двухфазный уход из solo: сначала останавливаем RAF-цикл одиночной сцены,
  // и лишь следующим кадром (когда useFrame'ы заведомо не выполняются) `App`
  // размонтирует `<Physics>`. Иначе освобождение Rapier-мира гонится с в-полёте
  // useFrame'ами → пачка «null pointer passed to rust» в консоли (косметика, но
  // видно в devtools). См. эффект в `App.tsx`.
  requestEnterNet: () => set({ leavingSolo: true }),
  // Чистый старт сессии при входе: сбрасываем прошлую комнату (имя игрока
  // сохраняется). Сброс делается ЗДЕСЬ, а не в cleanup провайдера, чтобы
  // suspend-remount боевой сцены не выкидывал игрока из комнаты.
  enterNet: () => {
    useNetRoomStore.getState().leaveRoom();
    set({ appMode: 'net', netScreen: 'menu', leavingSolo: false });
  },
  exitNet: () => {
    useNetRoomStore.getState().leaveRoom();
    set({ appMode: 'solo', netScreen: 'menu', leavingSolo: false });
  },
  setNetScreen: (screen) => set({ netScreen: screen }),
}));

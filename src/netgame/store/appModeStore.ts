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
   * Войти в сетевой режим. Solo-сцена при этом НЕ размонтируется, а прячется
   * (см. App.tsx): снос живого Rapier-мира — библиотечная гонка teardown'а.
   */
  enterNet: () => void;
  /** Вернуться в одиночную игру (показывает скрытую solo-сцену, мир жив). */
  exitNet: () => void;
  setNetScreen: (screen: NetScreen) => void;
}

export const useAppModeStore = create<AppModeState>()((set) => ({
  appMode: 'solo',
  netScreen: 'menu',
  // Чистый старт сессии при входе: сбрасываем прошлую комнату (имя игрока
  // сохраняется). Сброс делается ЗДЕСЬ, а не в cleanup провайдера, чтобы
  // suspend-remount боевой сцены не выкидывал игрока из комнаты.
  enterNet: () => {
    useNetRoomStore.getState().leaveRoom();
    set({ appMode: 'net', netScreen: 'menu' });
  },
  exitNet: () => {
    useNetRoomStore.getState().leaveRoom();
    set({ appMode: 'solo', netScreen: 'menu' });
  },
  setNetScreen: (screen) => set({ netScreen: screen }),
}));

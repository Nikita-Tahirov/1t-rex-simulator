import { useEffect, useRef } from 'react';

/**
 * Низкоуровневый хук клавиатуры для контроллера робота.
 * Возвращает ref на актуальное состояние клавиш — не перерендеривает компонент.
 *
 * Используется в `useFrame`-петле, где нужны живые значения, а не реактивные.
 */

export interface KeyboardState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  brake: boolean;
  spinnerUp: boolean;
  spinnerDown: boolean;
  reset: boolean;
}

const KEY_MAP: Record<string, keyof KeyboardState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'brake',
  KeyR: 'spinnerUp',
  KeyF: 'spinnerDown',
  KeyX: 'reset',
};

const initial: KeyboardState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  brake: false,
  spinnerUp: false,
  spinnerDown: false,
  reset: false,
};

function resetKeyboardState(state: KeyboardState): void {
  Object.assign(state, initial);
}

function applyPressedState(state: KeyboardState, key: keyof KeyboardState): void {
  state[key] = true;
  if (key === 'forward') state.backward = false;
  if (key === 'backward') state.forward = false;
  if (key === 'left') state.right = false;
  if (key === 'right') state.left = false;
}

/**
 * Ввод в текстовое поле не должен управлять роботом и, главное, не должен
 * глушиться `preventDefault`: KEY_MAP матчит ФИЗИЧЕСКИЕ коды (KeyW/KeyA/…),
 * которые в русской раскладке — буквы «ц/ф/ы/в/к/а/ч» и пробел. Без этой
 * проверки скрытая solo-сцена (keep-alive при сетевом режиме) съедала половину
 * символов в полях имени игрока/комнаты.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable === true
  );
}

export function useKeyboard(): React.RefObject<KeyboardState> {
  const ref = useRef<KeyboardState>({ ...initial });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const key = KEY_MAP[e.code];
      if (key) {
        applyPressedState(ref.current, key);
        e.preventDefault();
      }
    };
    // keyup НЕ фильтруем по editable: отпускание не мешает вводу (нет
    // preventDefault), а пропуск keyup залипал бы клавишей, зажатой до фокуса.
    const onUp = (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      if (key) ref.current[key] = false;
    };
    const onBlur = () => resetKeyboardState(ref.current);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') resetKeyboardState(ref.current);
    };
    window.addEventListener('keydown', onDown, { capture: true });
    window.addEventListener('keyup', onUp, { capture: true });
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onDown, { capture: true });
      window.removeEventListener('keyup', onUp, { capture: true });
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return ref;
}

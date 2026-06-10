import { useAppModeStore } from './store/appModeStore.ts';
import { NET_STRINGS } from './strings.ts';

/**
 * Кнопка входа в сетевой режим, поверх одиночной сцены.
 *
 * Намеренно крошечная и статически импортируемая (без Firebase и сетевого кода)
 * — она лишь переключает `appMode` в сторе. Весь сетевой код грузится лениво
 * только после клика (`NetGameRoot`). Размещена сверху по центру, чтобы не
 * пересекаться с панелью управления (слева) и HUD (справа).
 */
export function NetModeButton() {
  // requestEnterNet (не enterNet): сначала замораживаем solo-RAF, переход в сеть
  // делает эффект в App следующим кадром — иначе teardown Rapier-мира одиночки
  // гонится с useFrame'ами (см. appModeStore.leavingSolo).
  const requestEnterNet = useAppModeStore((s) => s.requestEnterNet);

  return (
    <button
      type="button"
      onClick={requestEnterNet}
      aria-label={NET_STRINGS.enterButton}
      className="sim-control pointer-events-auto absolute top-4 left-1/2 z-10 -translate-x-1/2 px-4 py-2 font-mono text-xs"
    >
      ⚔ {NET_STRINGS.enterButton}
    </button>
  );
}

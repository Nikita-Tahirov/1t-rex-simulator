import { useAppModeStore } from '../store/appModeStore.ts';
import { NET_STRINGS } from '../strings.ts';
import { NameField, NetScreenShell } from './shared.tsx';

/** Стартовое меню сетевого режима: имя игрока и переход к списку комнат. */
export function NetMenuScreen() {
  const setNetScreen = useAppModeStore((s) => s.setNetScreen);
  const exitNet = useAppModeStore((s) => s.exitNet);

  return (
    <NetScreenShell title={NET_STRINGS.menuTitle} subtitle={NET_STRINGS.menuSubtitle}>
      <NameField />
      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="sim-control sim-control--primary px-4 py-2"
          onClick={() => setNetScreen('rooms')}
        >
          {NET_STRINGS.menuPlay}
        </button>
        <button
          type="button"
          className="px-4 py-2 text-xs text-[var(--color-text-dim)] underline-offset-4 hover:underline"
          onClick={exitNet}
        >
          {NET_STRINGS.toSolo}
        </button>
      </div>
    </NetScreenShell>
  );
}

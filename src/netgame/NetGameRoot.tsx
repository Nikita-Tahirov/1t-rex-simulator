import { Suspense } from 'react';
import { NetBattleScene } from './battle/NetBattleScene.tsx';
import { LobbyScreen } from './screens/LobbyScreen.tsx';
import { NetMenuScreen } from './screens/NetMenuScreen.tsx';
import { ResultScreen } from './screens/ResultScreen.tsx';
import { RoomListScreen } from './screens/RoomListScreen.tsx';
import { NetSessionProvider } from './session/NetSessionProvider.tsx';
import { useAppModeStore } from './store/appModeStore.ts';
import { useNetRoomStore } from './store/netRoomStore.ts';

/**
 * Корень сетевого режима — ленивый оверлей, монтируемый только при
 * `appMode==='net'` (через `lazy()` в App). Поэтому в одиночной игре этот модуль
 * и его зависимости не грузятся. Диспетчеризует экран: пока игрок не в комнате —
 * по `netScreen` (меню/список), а в комнате — по статусу комнаты (лобби/бой/итог).
 */
export function NetGameRoot() {
  return (
    <NetSessionProvider>
      {/* Suspense НИЖЕ провайдера: ловит suspend боевой сцены (Canvas/Physics/GLTF)
          здесь, а не во внешнем Suspense App (он выше провайдера) — иначе всплытие
          размонтировало бы сессию и выкидывало игрока из комнаты. */}
      <Suspense fallback={null}>
        <NetGameScreens />
      </Suspense>
    </NetSessionProvider>
  );
}

function NetGameScreens() {
  const netScreen = useAppModeStore((s) => s.netScreen);
  const roomId = useNetRoomStore((s) => s.roomId);
  const room = useNetRoomStore((s) => s.room);

  if (roomId) {
    const status = room?.meta.status ?? 'lobby';
    if (status === 'finished') return <ResultScreen />;
    if (status === 'active' || status === 'countdown') return <NetBattleScene />;
    return <LobbyScreen />;
  }
  return netScreen === 'menu' ? <NetMenuScreen /> : <RoomListScreen />;
}

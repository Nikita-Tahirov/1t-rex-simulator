import { useEffect } from 'react';
import { canStartMatch, isHost, playerList } from '../net/lobby.ts';
import { useNetSessionContext } from '../session/netSessionContext.ts';
import { NET_STRINGS } from '../strings.ts';
import { ColorDot, NetScreenShell } from './shared.tsx';

/** Лобби комнаты: кто подключился, готовность, старт боя у хозяина. */
export function LobbyScreen() {
  const { room, uid, ready, error, setReady, startMatch, leaveRoom, ensureHost } =
    useNetSessionContext();

  // Хост оборвался (закрыл вкладку/сеть): onDisconnect удалил его player-узел,
  // но meta.hostId остался — без такеовера лобби неуправляемо (никто не может
  // нажать «Начать бой»). ensureHost идемпотентен: роль возьмёт старший по
  // joinedAt из оставшихся; раньше это чинилось только в активном бою.
  useEffect(() => {
    if (room && uid && !room.players[room.meta.hostId]) void ensureHost();
  }, [room, uid, ensureHost]);

  if (!room || !uid) {
    return <NetScreenShell title={NET_STRINGS.lobbyTitle}>{NET_STRINGS.connecting}</NetScreenShell>;
  }

  const players = playerList(room.players);
  const host = isHost(room, uid);
  const canStart = canStartMatch(room, uid);
  const needMore = players.length < 2;

  return (
    <NetScreenShell title={room.meta.name} subtitle={NET_STRINGS.lobbyTitle}>
      <ul className="mb-5 flex flex-col gap-2">
        {players.map((player) => (
          <li
            key={player.uid}
            className="sim-card flex items-center justify-between gap-3 px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ColorDot index={player.colorIndex} />
              <span className="truncate font-mono text-sm">{player.name}</span>
              {player.uid === room.meta.hostId && (
                <span className="rounded bg-[var(--surface-raised-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]">
                  {NET_STRINGS.lobbyHost}
                </span>
              )}
              {player.uid === uid && (
                <span className="text-[10px] text-[var(--color-text-dim)]">(вы)</span>
              )}
            </span>
            <span
              className={`text-xs ${player.ready ? 'text-[var(--color-ok)]' : 'text-[var(--color-text-dim)]'}`}
            >
              {player.ready ? NET_STRINGS.lobbyStatusReady : NET_STRINGS.lobbyStatusNotReady}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        {/* Таймаут недоступного сервера и прочие отказы операций — не молчим. */}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <button
          type="button"
          className={`sim-control px-4 py-2 ${ready ? 'sim-control--active' : ''}`}
          aria-pressed={ready}
          onClick={() => setReady(!ready)}
        >
          {ready ? NET_STRINGS.lobbyYouNotReady : NET_STRINGS.lobbyYouReady}
        </button>

        {host && (
          <button
            type="button"
            disabled={!canStart}
            className="sim-control sim-control--primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={startMatch}
          >
            {NET_STRINGS.lobbyStart}
          </button>
        )}
        {host && !canStart && (
          <p className="text-center text-xs text-[var(--color-text-dim)]">
            {needMore ? NET_STRINGS.lobbyNeedMore : NET_STRINGS.lobbyWaiting}
          </p>
        )}
        {!host && (
          <p className="text-center text-xs text-[var(--color-text-dim)]">
            {NET_STRINGS.lobbyWaiting}
          </p>
        )}

        <button
          type="button"
          className="px-2 py-1 text-xs text-[var(--color-text-dim)] underline-offset-4 hover:underline"
          onClick={leaveRoom}
        >
          {NET_STRINGS.lobbyLeave}
        </button>
      </div>
    </NetScreenShell>
  );
}

import { useNetSessionContext } from '../session/netSessionContext.ts';
import { useAppModeStore } from '../store/appModeStore.ts';
import { NET_STRINGS } from '../strings.ts';
import { ColorDot, NetScreenShell } from './shared.tsx';

/** Экран результата: победа/поражение/ничья, реванш (host) и выходы. */
export function ResultScreen() {
  const { room, uid, rematch, leaveRoom } = useNetSessionContext();
  const exitNet = useAppModeStore((s) => s.exitNet);
  if (!room || !uid) {
    return <NetScreenShell title={NET_STRINGS.resultDraw}>{NET_STRINGS.connecting}</NetScreenShell>;
  }

  const { winnerId, hostId } = room.meta;
  const isDraw = winnerId === null;
  const isWinner = winnerId === uid;
  const title = isDraw
    ? NET_STRINGS.resultDraw
    : isWinner
      ? NET_STRINGS.resultVictory
      : NET_STRINGS.resultDefeat;
  const winner = winnerId ? room.players[winnerId] : undefined;
  const host = hostId === uid;

  return (
    <NetScreenShell title={title}>
      {winner && (
        <p className="mb-6 flex items-center justify-center gap-2 text-sm text-[var(--color-text-dim)]">
          <ColorDot index={winner.colorIndex} />
          {NET_STRINGS.resultWinner(winner.name)}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {host && (
          <button
            type="button"
            className="sim-control sim-control--primary px-4 py-2"
            onClick={rematch}
          >
            {NET_STRINGS.resultRematch}
          </button>
        )}
        <button type="button" className="sim-control px-4 py-2" onClick={leaveRoom}>
          {NET_STRINGS.resultToRooms}
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs text-[var(--color-text-dim)] underline-offset-4 hover:underline"
          onClick={exitNet}
        >
          {NET_STRINGS.toSolo}
        </button>
      </div>
    </NetScreenShell>
  );
}

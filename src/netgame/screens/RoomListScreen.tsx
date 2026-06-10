import { useState } from 'react';
import type { RoomListItem } from '../net/types.ts';
import { useNetSessionContext } from '../session/netSessionContext.ts';
import { useAppModeStore } from '../store/appModeStore.ts';
import { NET_STRINGS } from '../strings.ts';
import { INPUT_CLASS, NameField, NetScreenShell } from './shared.tsx';

/** Список открытых комнат: создать свою или войти в чужую. */
export function RoomListScreen() {
  const { uid, rooms, error, createRoom, joinRoom } = useNetSessionContext();
  const setNetScreen = useAppModeStore((s) => s.setNetScreen);
  const exitNet = useAppModeStore((s) => s.exitNet);
  const [newRoomName, setNewRoomName] = useState('');
  // Порт инициализируется асинхронно (firebase: signInAnonymously — сетевой
  // round-trip). До готовности uid=null, а createRoom/joinRoom — no-op. Гейтим
  // кнопки, чтобы клик не «проваливался» молча.
  const connecting = !uid;

  return (
    <NetScreenShell title={NET_STRINGS.roomsTitle}>
      <NameField />

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={newRoomName}
          onChange={(event) => setNewRoomName(event.target.value)}
          placeholder={NET_STRINGS.roomNamePlaceholder}
          maxLength={24}
          aria-label={NET_STRINGS.roomNamePlaceholder}
          className={INPUT_CLASS}
        />
        <button
          type="button"
          disabled={connecting}
          className="sim-control sim-control--primary whitespace-nowrap px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => createRoom(newRoomName)}
        >
          {NET_STRINGS.roomsCreate}
        </button>
      </div>

      {connecting && (
        <p className="mb-3 text-sm text-[var(--color-text-dim)]">{NET_STRINGS.roomConnecting}</p>
      )}
      {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}

      <ul className="mb-4 flex max-h-64 flex-col gap-2 overflow-auto">
        {rooms.length === 0 && (
          <li className="py-6 text-center text-sm text-[var(--color-text-dim)]">
            {NET_STRINGS.roomsEmpty}
          </li>
        )}
        {rooms.map((room) => (
          <RoomRow
            key={room.roomId}
            room={room}
            connecting={connecting}
            onJoin={() => joinRoom(room.roomId)}
          />
        ))}
      </ul>

      <button
        type="button"
        className="px-2 py-1 text-xs text-[var(--color-text-dim)] underline-offset-4 hover:underline"
        onClick={() => setNetScreen('menu')}
      >
        {NET_STRINGS.back}
      </button>
      <button
        type="button"
        className="ml-3 px-2 py-1 text-xs text-[var(--color-text-dim)] underline-offset-4 hover:underline"
        onClick={exitNet}
      >
        {NET_STRINGS.toSolo}
      </button>
    </NetScreenShell>
  );
}

function RoomRow({
  room,
  connecting,
  onJoin,
}: {
  room: RoomListItem;
  connecting: boolean;
  onJoin: () => void;
}) {
  const full = room.playerCount >= room.maxPlayers;
  const inProgress = room.status !== 'lobby';
  const disabled = full || inProgress || connecting;
  const note = inProgress ? NET_STRINGS.roomInProgress : full ? NET_STRINGS.roomFull : '';

  return (
    <li className="sim-card flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm">{room.name}</p>
        <p className="text-xs text-[var(--color-text-dim)]">
          {NET_STRINGS.roomPlayers(room.playerCount, room.maxPlayers)}
          {note && ` · ${note}`}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled}
        className="sim-control px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onJoin}
      >
        {NET_STRINGS.roomsJoin}
      </button>
    </li>
  );
}

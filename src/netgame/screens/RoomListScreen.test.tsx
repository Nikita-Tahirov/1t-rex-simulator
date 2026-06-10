import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NetSessionContext } from '../session/netSessionContext.ts';
import type { NetSession } from '../session/useNetSession.ts';
import { NET_STRINGS } from '../strings.ts';
import { RoomListScreen } from './RoomListScreen.tsx';

function renderWithSession(overrides: Partial<NetSession>) {
  const session: NetSession = {
    uid: null,
    rooms: [],
    room: null,
    error: null,
    ready: false,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    setReady: vi.fn(),
    startMatch: vi.fn(),
    leaveRoom: vi.fn(),
    publishState: vi.fn(),
    finishMatch: vi.fn(),
    rematch: vi.fn(),
    ensureHost: vi.fn(),
    ...overrides,
  };
  return render(
    <NetSessionContext.Provider value={session}>
      <RoomListScreen />
    </NetSessionContext.Provider>,
  );
}

const sampleRoom = {
  roomId: 'r1',
  name: 'Арена',
  status: 'lobby' as const,
  playerCount: 1,
  maxPlayers: 4,
  hostId: 'host',
  updatedAt: 0,
};

describe('RoomListScreen — гейтинг по готовности порта', () => {
  it('uid=null: «Создать комнату» заблокирована, виден индикатор подключения', () => {
    renderWithSession({ uid: null });
    expect(screen.getByRole('button', { name: NET_STRINGS.roomsCreate })).toBeDisabled();
    expect(screen.getByText(NET_STRINGS.roomConnecting)).toBeInTheDocument();
  });

  it('uid задан: «Создать комнату» активна, индикатора нет', () => {
    renderWithSession({ uid: 'uid_ready' });
    expect(screen.getByRole('button', { name: NET_STRINGS.roomsCreate })).toBeEnabled();
    expect(screen.queryByText(NET_STRINGS.roomConnecting)).toBeNull();
  });

  it('uid=null: «Войти» в комнату тоже заблокирован', () => {
    renderWithSession({ uid: null, rooms: [sampleRoom] });
    expect(screen.getByRole('button', { name: NET_STRINGS.roomsJoin })).toBeDisabled();
  });

  it('uid задан + комната в лобби: «Войти» активен', () => {
    renderWithSession({ uid: 'uid_ready', rooms: [sampleRoom] });
    expect(screen.getByRole('button', { name: NET_STRINGS.roomsJoin })).toBeEnabled();
  });
});

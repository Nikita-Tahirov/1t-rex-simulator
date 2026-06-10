import type { PlayerInfo, PlayerState, RoomListItem, RoomMeta, RoomSnapshot } from './types.ts';

/**
 * In-memory backend сетевого режима — крошечная реплика «общей БД» без сети.
 *
 * Используется двумя способами:
 *   1) unit/e2e-тесты и одиночный процесс — несколько портов в одном контексте
 *      делят этот singleton напрямую (без BroadcastChannel, детерминированно).
 *   2) живое локальное демо в нескольких вкладках — `attachCrossTab()` поднимает
 *      BroadcastChannel, и вкладки одного браузера обмениваются мутациями,
 *      образуя реальный мультиплеер на одной машине без Firebase.
 *
 * Каждая запись авторитетна по своему пути (host пишет meta, игрок — свои
 * players/$uid и states/$uid), поэтому реплики сходятся без центрального сервера.
 */

interface RoomRecord {
  meta: RoomMeta;
  players: Record<string, PlayerInfo>;
  states: Record<string, PlayerState>;
}

type Mutation =
  | { kind: 'meta'; roomId: string; meta: RoomMeta }
  | { kind: 'player'; roomId: string; uid: string; info: PlayerInfo }
  | { kind: 'removePlayer'; roomId: string; uid: string }
  | { kind: 'state'; roomId: string; uid: string; state: PlayerState }
  | { kind: 'removeRoom'; roomId: string }
  | { kind: 'sync-request' }
  | { kind: 'sync-full'; rooms: RoomRecord[] };

const CHANNEL_NAME = '1trex-netgame';

class InMemoryBackend {
  private rooms = new Map<string, RoomRecord>();
  private listSubs = new Set<(rooms: RoomListItem[]) => void>();
  private roomSubs = new Map<string, Set<(room: RoomSnapshot | null) => void>>();
  private channel: BroadcastChannel | null = null;

  attachCrossTab(): void {
    if (this.channel || typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event: MessageEvent<Mutation>) => this.applyRemote(event.data);
    this.post({ kind: 'sync-request' });
  }

  reset(): void {
    this.rooms.clear();
    this.listSubs.clear();
    this.roomSubs.clear();
    this.channel?.close();
    this.channel = null;
  }

  // --- Подписки ---

  subscribeList(callback: (rooms: RoomListItem[]) => void): () => void {
    this.listSubs.add(callback);
    callback(this.roomList());
    return () => this.listSubs.delete(callback);
  }

  subscribeRoom(roomId: string, callback: (room: RoomSnapshot | null) => void): () => void {
    let set = this.roomSubs.get(roomId);
    if (!set) {
      set = new Set();
      this.roomSubs.set(roomId, set);
    }
    set.add(callback);
    callback(this.snapshot(roomId));
    return () => {
      set?.delete(callback);
    };
  }

  // --- Чтение ---

  getRoom(roomId: string): RoomSnapshot | null {
    return this.snapshot(roomId);
  }

  roomList(): RoomListItem[] {
    const items: RoomListItem[] = [];
    for (const record of this.rooms.values()) {
      const playerCount = Object.keys(record.players).length;
      if (playerCount === 0) continue;
      items.push({
        roomId: record.meta.roomId,
        name: record.meta.name,
        status: record.meta.status,
        playerCount,
        maxPlayers: record.meta.maxPlayers,
        hostId: record.meta.hostId,
        updatedAt: record.meta.createdAt,
      });
    }
    return items.sort((a, b) => b.roomId.localeCompare(a.roomId));
  }

  // --- Мутации (локальные + broadcast) ---

  putMeta(meta: RoomMeta): void {
    this.applyMeta(meta);
    this.post({ kind: 'meta', roomId: meta.roomId, meta });
  }

  putPlayer(roomId: string, info: PlayerInfo): void {
    this.applyPlayer(roomId, info);
    this.post({ kind: 'player', roomId, uid: info.uid, info });
  }

  removePlayer(roomId: string, uid: string): void {
    this.applyRemovePlayer(roomId, uid);
    this.post({ kind: 'removePlayer', roomId, uid });
  }

  putState(roomId: string, uid: string, state: PlayerState): void {
    this.applyState(roomId, uid, state);
    this.post({ kind: 'state', roomId, uid, state });
  }

  // --- Применение мутаций (без повторного broadcast) ---

  private applyRemote(mutation: Mutation): void {
    switch (mutation.kind) {
      case 'meta':
        this.applyMeta(mutation.meta);
        break;
      case 'player':
        this.applyPlayer(mutation.roomId, mutation.info);
        break;
      case 'removePlayer':
        this.applyRemovePlayer(mutation.roomId, mutation.uid);
        break;
      case 'state':
        this.applyState(mutation.roomId, mutation.uid, mutation.state);
        break;
      case 'removeRoom':
        this.rooms.delete(mutation.roomId);
        this.notifyRoom(mutation.roomId);
        this.notifyList();
        break;
      case 'sync-request':
        this.post({ kind: 'sync-full', rooms: [...this.rooms.values()] });
        break;
      case 'sync-full':
        for (const record of mutation.rooms) this.mergeRecord(record);
        break;
    }
  }

  private ensureRoom(meta: RoomMeta): RoomRecord {
    let record = this.rooms.get(meta.roomId);
    if (!record) {
      record = { meta, players: {}, states: {} };
      this.rooms.set(meta.roomId, record);
    } else {
      record.meta = meta;
    }
    return record;
  }

  private applyMeta(meta: RoomMeta): void {
    this.ensureRoom(meta);
    this.notifyRoom(meta.roomId);
    this.notifyList();
  }

  private applyPlayer(roomId: string, info: PlayerInfo): void {
    const record = this.rooms.get(roomId);
    if (!record) return;
    record.players[info.uid] = info;
    this.notifyRoom(roomId);
    this.notifyList();
  }

  private applyRemovePlayer(roomId: string, uid: string): void {
    const record = this.rooms.get(roomId);
    if (!record) return;
    delete record.players[uid];
    delete record.states[uid];
    if (Object.keys(record.players).length === 0) this.rooms.delete(roomId);
    this.notifyRoom(roomId);
    this.notifyList();
  }

  private applyState(roomId: string, uid: string, state: PlayerState): void {
    const record = this.rooms.get(roomId);
    if (!record) return;
    const prev = record.states[uid];
    if (prev && prev.seq > state.seq) return;
    record.states[uid] = state;
    this.notifyRoom(roomId);
  }

  private mergeRecord(incoming: RoomRecord): void {
    const existing = this.rooms.get(incoming.meta.roomId);
    if (!existing) {
      this.rooms.set(incoming.meta.roomId, incoming);
    } else {
      for (const [uid, info] of Object.entries(incoming.players)) {
        existing.players[uid] ??= info;
      }
      for (const [uid, state] of Object.entries(incoming.states)) {
        if (!existing.states[uid] || existing.states[uid]!.seq < state.seq) {
          existing.states[uid] = state;
        }
      }
    }
    this.notifyRoom(incoming.meta.roomId);
    this.notifyList();
  }

  private snapshot(roomId: string): RoomSnapshot | null {
    const record = this.rooms.get(roomId);
    if (!record) return null;
    return {
      meta: { ...record.meta },
      players: { ...record.players },
      states: { ...record.states },
    };
  }

  private notifyRoom(roomId: string): void {
    const snapshot = this.snapshot(roomId);
    for (const cb of this.roomSubs.get(roomId) ?? []) cb(snapshot);
  }

  private notifyList(): void {
    const list = this.roomList();
    for (const cb of this.listSubs) cb(list);
  }

  private post(mutation: Mutation): void {
    this.channel?.postMessage(mutation);
  }
}

/** Общий singleton backend. Делится всеми портами в одном JS-контексте. */
export const inMemoryBackend = new InMemoryBackend();

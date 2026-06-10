import type { PlayerState, RoomListItem, RoomSnapshot, Unsubscribe } from './types.ts';

/**
 * Порт сетевого слоя — единственная зависимость UI/синхронизации от транспорта.
 *
 * Реализации: `inMemoryAdapter` (без сети, для unit/e2e и локального демо в
 * нескольких вкладках через BroadcastChannel) и `firebaseAdapter` (RTDB +
 * Anonymous Auth). Благодаря этому порту логику лобби/боя можно тестировать без
 * реального Firebase, подменяя адаптер in-memory.
 *
 * Модель авторитетности: каждый клиент пишет только СВОИ узлы (`players/$uid`,
 * `states/$uid`); host дополнительно пишет `meta`. Это отражено и в правилах
 * безопасности RTDB.
 */
export interface NetworkPort {
  /** Стабильный идентификатор этого клиента (uid анонимной сессии). */
  readonly uid: string;

  /**
   * Фактический транспорт. `memory` означает «комнаты видны только в этом
   * браузере» — UI обязан показывать это пользователю, особенно когда memory
   * получился ДЕГРАДАЦИЕЙ из firebase (иначе «комната не видна на другом
   * устройстве» выглядит как загадочная поломка).
   */
  readonly kind: 'firebase' | 'memory';

  /** Подписка на общий список открытых комнат (лобби-экран). */
  listRooms(callback: (rooms: RoomListItem[]) => void): Unsubscribe;

  /** Создать комнату; создатель становится host и сразу входит. → roomId. */
  createRoom(roomName: string, playerName: string): Promise<string>;

  /** Войти в существующую комнату под именем `playerName`. */
  joinRoom(roomId: string, playerName: string): Promise<void>;

  /** Подписка на полное состояние комнаты (meta + players + states). */
  subscribeRoom(roomId: string, callback: (room: RoomSnapshot | null) => void): Unsubscribe;

  /** Поставить/снять свою готовность. */
  setReady(roomId: string, ready: boolean): Promise<void>;

  /** Старт боя (только host): фиксирует arenaSeed, нормализует углы, status=active. */
  startMatch(roomId: string): Promise<void>;

  /** Опубликовать своё боевое состояние (горячий путь, ~12 Гц). */
  publishState(roomId: string, state: PlayerState): void;

  /** Зафиксировать финал матча (идемпотентно: только из status=active). */
  finishMatch(roomId: string, winnerId: string | null): Promise<void>;

  /** Реванш (только host): вернуть комнату в лобби для нового боя. */
  rematch(roomId: string): Promise<void>;

  /** Выйти из комнаты и убрать свой presence. */
  leaveRoom(roomId: string): Promise<void>;

  /**
   * Подхватить роль host, если прежний host исчез из комнаты, а я — старший по
   * времени входа из оставшихся. Идемпотентно; для устойчивости к отключению host.
   */
  ensureHost(roomId: string): Promise<void>;

  /** Отключиться от транспорта (закрыть подписки/каналы). */
  dispose(): void;
}

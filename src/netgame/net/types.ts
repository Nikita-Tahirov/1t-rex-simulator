/**
 * Типы данных сетевого режима — единый контракт между UI, синхронизацией и
 * адаптерами (in-memory и Firebase RTDB).
 *
 * Дерево данных (в RTDB и в in-memory backend идентично по смыслу):
 *   rooms/$roomId/meta            — редкие записи, host-авторитетные
 *   rooms/$roomId/players/$uid    — кто в комнате (пишет только свой $uid)
 *   rooms/$roomId/states/$uid     — горячая боевая поза/здоровье (~12 Гц, свой $uid)
 *
 * Внешний JSON всегда считается `unknown` и нормализуется на границе
 * (`snapshotMapping.ts`) — инвариант проекта.
 */

/** Максимум игроков в комнате = число углов арены. */
export const MAX_PLAYERS = 4;

/** Стадия комнаты. */
export type RoomStatus = 'lobby' | 'countdown' | 'active' | 'finished';

/** Лёгкая запись для общего списка комнат. */
export interface RoomListItem {
  roomId: string;
  name: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  hostId: string;
}

/** Игрок в комнате (лобби-уровень, редкие изменения). */
export interface PlayerInfo {
  uid: string;
  name: string;
  /** Индекс угла/цвета 0..3, назначается при входе и нормализуется на старте. */
  colorIndex: number;
  ready: boolean;
  joinedAt: number;
  /** Онлайн ли игрок (presence). */
  presence: boolean;
}

/** Метаданные комнаты (host-авторитетные). */
export interface RoomMeta {
  roomId: string;
  name: string;
  hostId: string;
  status: RoomStatus;
  /** Сид арены, фиксируется на старте (0 до старта). */
  arenaSeed: number;
  maxPlayers: number;
  createdAt: number;
  /** Время окончания обратного отсчёта (мс эпохи) или null. */
  countdownEndsAt: number | null;
  /** Uid победителя после финала, либо null (ничья/не закончен). */
  winnerId: string | null;
  /**
   * Финальное распределение углов uid → 0..3, которое host фиксирует на старте.
   * До старта пусто. Это host-авторитетная запись (игрок не может писать чужой
   * `players/$uid`), поэтому углы боя назначаются здесь, а не в players.
   */
  corners: Record<string, number>;
}

/** Горячее боевое состояние одного робота (self-authoritative). */
export interface PlayerState {
  x: number;
  z: number;
  /** Высота центра шасси, м — для подброса/опрокидывания. */
  y: number;
  /** Рыскание, рад (для 2D-логики и kinematic-визуала). */
  yaw: number;
  /** Полная ориентация тела (кватернион) — для синхронного опрокидывания/наклона. */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Линейная скорость, м/с (для интерполяции/эффектов). */
  speed: number;
  /** Компоненты линейной скорости, м/с — для экстраполяции/feedforward. */
  vx: number;
  vz: number;
  /** Обороты спиннера, об/мин (для визуала призрака и оружия). */
  spinnerRpm: number;
  /** Здоровье 0..ROBOT_MAX_HEALTH. */
  health: number;
  alive: boolean;
  /** Монотонный счётчик клиента — отбрасывает устаревшие пакеты. */
  seq: number;
  /** Время снимка (мс эпохи отправителя) — только для диагностики/латентности. */
  t: number;
  /**
   * Накопительный урон, который ЭТОТ робот нанёс каждому сопернику (uid → сумма).
   * Урон наносит атакующий (он надёжно детектит контакт), а применяет к своему
   * HP жертва по дельте — это переживает потери пакетов (нужно лишь последнее
   * значение) и чинит асимметрию интерполяции. Пусто, если урон ещё не нанесён.
   */
  dealt: Record<string, number>;
}

/** Полное состояние комнаты, как его видит подписчик. */
export interface RoomSnapshot {
  meta: RoomMeta;
  players: Record<string, PlayerInfo>;
  states: Record<string, PlayerState>;
}

/** Функция отписки от подписки. */
export type Unsubscribe = () => void;

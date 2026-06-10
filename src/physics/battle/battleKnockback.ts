/**
 * Client-side hit-reaction: жертва, получив урон по сети (`dealt`-дельта),
 * применяет импульс СВОЕМУ динамическому телу — отброс от атакующего с
 * подбросом. Стандартный приём p2p-игр: физический удар виден на экране
 * жертвы немедленно, без ожидания согласования поз (расхождения допустимы
 * по принятой модели «каждый клиент авторитетен над своим роботом»).
 */

export interface KnockbackImpulse {
  x: number;
  y: number;
  z: number;
}

/** Импульс (Н·с) на единицу полученного урона: 30 урона ≈ Δv 4 м/с при ~99 кг. */
export const KNOCKBACK_NS_PER_DAMAGE = 13;
/** Потолок импульса одного тика — отброс не превращается в телепорт. */
export const KNOCKBACK_MAX_NS = 520;
/** Доля вертикальной составляющей: vertical-spinner бьёт снизу вверх. */
export const KNOCKBACK_UP_RATIO = 0.45;

/**
 * Заполняет `out` импульсом отброса жертвы от атакующего. Возвращает false при
 * нулевом уроне. Если позиции совпали (деление на ~0) — бьёт чисто вверх.
 */
export function knockbackImpulse(
  damage: number,
  attackerX: number,
  attackerZ: number,
  selfX: number,
  selfZ: number,
  out: KnockbackImpulse,
): boolean {
  if (damage <= 0) return false;
  const magnitude = Math.min(KNOCKBACK_MAX_NS, damage * KNOCKBACK_NS_PER_DAMAGE);
  const dx = selfX - attackerX;
  const dz = selfZ - attackerZ;
  const dist = Math.hypot(dx, dz);
  const horizontal = magnitude * (1 - KNOCKBACK_UP_RATIO);
  if (dist < 1e-6) {
    out.x = 0;
    out.z = 0;
  } else {
    out.x = (dx / dist) * horizontal;
    out.z = (dz / dist) * horizontal;
  }
  out.y = magnitude * KNOCKBACK_UP_RATIO;
  return true;
}

// Очередь «один импульс на кадр» между сетевым хуком (useIncomingDamage) и
// телом локального робота (useFrame в LocalDynamicRobot). Module-scope singleton
// по образцу battlePoses: на клиенте ровно один локальный робот. Накапливает
// сумму, если за кадр пришло несколько ударов; без аллокаций в hot-path.
const pending: KnockbackImpulse = { x: 0, y: 0, z: 0 };
let hasPending = false;

export function queueKnockback(impulse: KnockbackImpulse): void {
  pending.x += impulse.x;
  pending.y += impulse.y;
  pending.z += impulse.z;
  hasPending = true;
}

/** Переносит накопленный импульс в `out` и очищает очередь. */
export function drainKnockback(out: KnockbackImpulse): boolean {
  if (!hasPending) return false;
  out.x = pending.x;
  out.y = pending.y;
  out.z = pending.z;
  pending.x = 0;
  pending.y = 0;
  pending.z = 0;
  hasPending = false;
  return true;
}

/** Сброс между матчами/тестами. */
export function resetKnockback(): void {
  pending.x = 0;
  pending.y = 0;
  pending.z = 0;
  hasPending = false;
}

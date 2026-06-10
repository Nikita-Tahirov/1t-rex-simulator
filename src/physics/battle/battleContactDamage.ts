/**
 * Перевод РЕАЛЬНЫХ контактов Rapier в урон боя. Чистые функции (тестируются);
 * событийную обвязку (onContactForce) делает компонент. Сохраняем модель
 * «атакующий копит → жертва применяет дельту» — урон контактом пишется в тот же
 * накопитель `dealt`, что и кинематический путь.
 */

/** Кулдаун между двумя засчитанными контактами по одной жертве, мс. */
export const CONTACT_DAMAGE_COOLDOWN_MS = 200;
/** Ниже этой контактной силы таран не наносит урона (мягкое касание/трение). */
export const RAM_FORCE_THRESHOLD_N = 700;
/** Ньютонов контактной силы на 1 ед. урона тарана. */
export const RAM_FORCE_PER_DAMAGE = 220;
/** Верхний предел урона за один контакт тарана. */
export const RAM_DAMAGE_CAP = 130;
/** Минимальные обороты ротора, при которых контакт диска наносит урон. */
export const ROTOR_ACTIVE_RPM = 1500;
/** Минимальная контактная сила ротора для засчитывания удара. */
export const ROTOR_FORCE_THRESHOLD_N = 150;
/** Базовый урон контакта ротора при максимальных оборотах. */
export const ROTOR_DAMAGE_PER_HIT = 26;
/** Опорные обороты для масштабирования урона ротора. */
export const ROTOR_RPM_REF = 7000;
/** Минимальная сила контакта со стеной, наносящая самоурон. */
export const WALL_FORCE_THRESHOLD_N = 2600;

/** Урон тарана по величине контактной силы (Н). 0 при мягком касании. */
export function ramDamageFromForce(forceN: number): number {
  const over = Math.max(0, forceN - RAM_FORCE_THRESHOLD_N);
  return Math.min(RAM_DAMAGE_CAP, over / RAM_FORCE_PER_DAMAGE);
}

/** Урон контакта ротора: только при активных оборотах и ощутимой силе, ∝ оборотам. */
export function rotorContactDamage(rpm: number, forceN: number): number {
  if (rpm < ROTOR_ACTIVE_RPM || forceN < ROTOR_FORCE_THRESHOLD_N) return 0;
  return ROTOR_DAMAGE_PER_HIT * Math.min(1, rpm / ROTOR_RPM_REF);
}

/** Самоурон от удара о стену по контактной силе (переиспользует impact-кривую снаружи). */
export function wallImpactExceeds(forceN: number): boolean {
  return forceN >= WALL_FORCE_THRESHOLD_N;
}

/**
 * Прошёл ли кулдаун по жертве `uid` (и регистрирует попадание). Мутирует карту —
 * вызывать из событийного обработчика, не из рендера.
 */
export function passesContactCooldown(
  map: Map<string, number>,
  uid: string,
  nowMs: number,
): boolean {
  if (nowMs - (map.get(uid) ?? Number.NEGATIVE_INFINITY) < CONTACT_DAMAGE_COOLDOWN_MS) return false;
  map.set(uid, nowMs);
  return true;
}

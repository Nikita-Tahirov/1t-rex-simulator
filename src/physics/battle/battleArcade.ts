/**
 * Чистая аркадная кинематика боевого робота: интегрирование позы, кламп к
 * прямоугольной арене и расталкивание роботов между собой. Без Rapier и без
 * побочных эффектов — поэтому покрывается unit-тестами и одинаково считается на
 * каждом клиенте (небольшие расхождения столкновений между клиентами допустимы).
 *
 * Конвенция рыскания совпадает с симулятором: forward = (cos yaw, sin yaw) в
 * плоскости (x, z); поворот «направо» (D) увеличивает yaw.
 */

export interface ArcadePose {
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

export interface ArcadeInput {
  /** Газ вперёд/назад [-1..1]. */
  throttle: number;
  /** Поворот [-1..1] (право = +). */
  turn: number;
  /** Тормоз [0..1]. */
  brake: number;
}

export interface ArcadeParams {
  maxSpeed: number;
  maxYawRate: number;
  /** Постоянная времени разгона/торможения, с. */
  accelTau: number;
  /** Множитель мощности от повреждений [0..1]. */
  driveScale: number;
}

/** Шаг аркадной модели: возвращает новую позу (входная не мутируется). */
export function stepArcade(
  pose: ArcadePose,
  input: ArcadeInput,
  params: ArcadeParams,
  dt: number,
): ArcadePose {
  const targetSpeed = input.brake > 0 ? 0 : input.throttle * params.maxSpeed * params.driveScale;
  const blend = 1 - Math.exp(-dt / Math.max(1e-3, params.accelTau));
  const speed = pose.speed + (targetSpeed - pose.speed) * blend;
  const yaw = pose.yaw + input.turn * params.maxYawRate * params.driveScale * dt;
  const x = pose.x + Math.cos(yaw) * speed * dt;
  const z = pose.z + Math.sin(yaw) * speed * dt;
  return { x, z, yaw, speed };
}

export interface ClampResult {
  x: number;
  z: number;
  hit: boolean;
}

/** Кламп центра робота в квадрат [-limit, limit] по обеим осям. */
export function clampToArena(x: number, z: number, limit: number): ClampResult {
  const cx = Math.min(limit, Math.max(-limit, x));
  const cz = Math.min(limit, Math.max(-limit, z));
  return { x: cx, z: cz, hit: cx !== x || cz !== z };
}

export interface Obstacle {
  x: number;
  z: number;
}

export interface SeparationResult {
  x: number;
  z: number;
  /** Индекс ближайшего «протолкнутого» соперника или -1. */
  hitIndex: number;
}

/**
 * Выталкивает робота из пересечений с другими (круговая модель радиуса
 * `minDist/2` у каждого). Робот считается «твёрдым», поэтому свой центр
 * выталкиваем полностью — соперник-призрак выталкивает себя на своём клиенте.
 */
export function separateFromObstacles(
  x: number,
  z: number,
  others: readonly Obstacle[],
  minDist: number,
): SeparationResult {
  let rx = x;
  let rz = z;
  let hitIndex = -1;
  let maxOverlap = 0;
  for (let i = 0; i < others.length; i += 1) {
    const dx = rx - others[i]!.x;
    const dz = rz - others[i]!.z;
    const dist = Math.hypot(dx, dz);
    if (dist > minDist) continue;
    const overlap = minDist - dist;
    if (dist > 1e-6) {
      rx += (dx / dist) * overlap;
      rz += (dz / dist) * overlap;
    } else {
      rx += minDist;
    }
    if (overlap >= maxOverlap) {
      maxOverlap = overlap;
      hitIndex = i;
    }
  }
  return { x: rx, z: rz, hitIndex };
}

export interface MovingPose {
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

/**
 * Скорость сближения двух роботов вдоль линии между их центрами, м/с.
 * Симметрична: оба клиента вычисляют одно и то же значение → одинаковый урон при
 * self-authoritative здоровье (атакующий не получает несправедливо больше).
 */
export function closingSpeed(self: MovingPose, other: MovingPose): number {
  const myVx = Math.cos(self.yaw) * self.speed;
  const myVz = Math.sin(self.yaw) * self.speed;
  const enVx = Math.cos(other.yaw) * other.speed;
  const enVz = Math.sin(other.yaw) * other.speed;
  const dirX = other.x - self.x;
  const dirZ = other.z - self.z;
  const dist = Math.hypot(dirX, dirZ);
  if (dist < 1e-6) return Math.hypot(myVx - enVx, myVz - enVz);
  return Math.max(0, ((myVx - enVx) * dirX + (myVz - enVz) * dirZ) / dist);
}

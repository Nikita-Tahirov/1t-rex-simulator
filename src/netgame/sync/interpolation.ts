/**
 * Чистая интерполяция поз удалённых роботов из таймстемпленных снимков.
 *
 * Рендерим «в прошлом» на фиксированную задержку (`INTERP_DELAY_MS`): для каждого
 * момента находим два снимка вокруг него и линейно интерполируем позицию/скорость,
 * yaw — кратчайшим углом. Это сглаживает сетевой джиттер (расхождения допустимы).
 * Без побочных эффектов — покрывается unit-тестами.
 */

export interface Snapshot {
  t: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  health: number;
  alive: boolean;
}

export interface SampledPose {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  health: number;
  alive: boolean;
}

const MAX_SNAPSHOTS = 24;

/** Добавляет снимок в кольцевой буфер (упорядочен по t; устаревшие игнорируются). */
export function pushSnapshot(buffer: Snapshot[], snap: Snapshot): void {
  const last = buffer[buffer.length - 1];
  if (last && snap.t <= last.t) return;
  buffer.push(snap);
  if (buffer.length > MAX_SNAPSHOTS) buffer.shift();
}

function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return a + delta * t;
}

function copyInto(out: SampledPose, snap: Snapshot): void {
  out.x = snap.x;
  out.z = snap.z;
  out.yaw = snap.yaw;
  out.speed = snap.speed;
  out.health = snap.health;
  out.alive = snap.alive;
}

/**
 * Сэмплирует позу на момент `renderTime`. До старейшего снимка — держим
 * старейший; после новейшего — держим новейший (без экстраполяции телепортов).
 * Возвращает false, если буфер пуст.
 */
export function sampleSnapshots(buffer: Snapshot[], renderTime: number, out: SampledPose): boolean {
  if (buffer.length === 0) return false;
  const first = buffer[0]!;
  const last = buffer[buffer.length - 1]!;
  if (renderTime <= first.t) {
    copyInto(out, first);
    return true;
  }
  if (renderTime >= last.t) {
    copyInto(out, last);
    return true;
  }
  for (let i = 0; i < buffer.length - 1; i += 1) {
    const a = buffer[i]!;
    const b = buffer[i + 1]!;
    if (renderTime >= a.t && renderTime <= b.t) {
      const span = b.t - a.t;
      const t = span > 0 ? (renderTime - a.t) / span : 0;
      out.x = a.x + (b.x - a.x) * t;
      out.z = a.z + (b.z - a.z) * t;
      out.yaw = lerpAngle(a.yaw, b.yaw, t);
      out.speed = a.speed + (b.speed - a.speed) * t;
      // Здоровье/жизнь — дискретные, берём из более позднего снимка.
      out.health = b.health;
      out.alive = b.alive;
      return true;
    }
  }
  copyInto(out, last);
  return true;
}

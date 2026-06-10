/**
 * Чистая интерполяция ПОЛНЫХ поз удалённых роботов из таймстемпленных снимков.
 *
 * Рендерим «в прошлом» на фиксированную задержку (`INTERP_DELAY_MS`): находим два
 * снимка вокруг момента и интерполируем позицию/высоту/скорость линейно, yaw —
 * кратчайшим углом, ориентацию-кватернион — нормализованным lerp (nlerp,
 * кратчайший путь). Это сглаживает джиттер и синхронизирует наклон/опрокидывание
 * (расхождения допустимы). Без побочных эффектов — покрывается unit-тестами.
 */

export interface Snapshot {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  speed: number;
  vx: number;
  vz: number;
  spinnerRpm: number;
  health: number;
  alive: boolean;
}

export interface SampledPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  speed: number;
  vx: number;
  vz: number;
  spinnerRpm: number;
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

/** Нормализованный lerp кватерниона (nlerp) кратчайшим путём — пишет в out.q*. */
function nlerpQuat(out: SampledPose, a: Snapshot, b: Snapshot, t: number): void {
  let bx = b.qx;
  let by = b.qy;
  let bz = b.qz;
  let bw = b.qw;
  if (a.qx * bx + a.qy * by + a.qz * bz + a.qw * bw < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let rx = a.qx + (bx - a.qx) * t;
  let ry = a.qy + (by - a.qy) * t;
  let rz = a.qz + (bz - a.qz) * t;
  let rw = a.qw + (bw - a.qw) * t;
  const len = Math.hypot(rx, ry, rz, rw) || 1;
  rx /= len;
  ry /= len;
  rz /= len;
  rw /= len;
  out.qx = rx;
  out.qy = ry;
  out.qz = rz;
  out.qw = rw;
}

function copyInto(out: SampledPose, snap: Snapshot): void {
  out.x = snap.x;
  out.y = snap.y;
  out.z = snap.z;
  out.yaw = snap.yaw;
  out.qx = snap.qx;
  out.qy = snap.qy;
  out.qz = snap.qz;
  out.qw = snap.qw;
  out.speed = snap.speed;
  out.vx = snap.vx;
  out.vz = snap.vz;
  out.spinnerRpm = snap.spinnerRpm;
  out.health = snap.health;
  out.alive = snap.alive;
}

/**
 * Сэмплирует позу на момент `renderTime`. До старейшего — держим старейший.
 * После новейшего — при `extrapolateMaxMs > 0` коротко экстраполируем позицию по
 * компонентам скорости (`vx,vz`, скрывает потерю пакетов), дальше держим новейший
 * (без телепортов). Возвращает false, если буфер пуст.
 */
export function sampleSnapshots(
  buffer: Snapshot[],
  renderTime: number,
  out: SampledPose,
  extrapolateMaxMs = 0,
): boolean {
  if (buffer.length === 0) return false;
  const first = buffer[0]!;
  const last = buffer[buffer.length - 1]!;
  if (renderTime <= first.t) {
    copyInto(out, first);
    return true;
  }
  if (renderTime >= last.t) {
    copyInto(out, last);
    const ahead = renderTime - last.t;
    if (extrapolateMaxMs > 0 && ahead > 0 && last.alive) {
      const dtSec = Math.min(ahead, extrapolateMaxMs) / 1000;
      out.x = last.x + last.vx * dtSec;
      out.z = last.z + last.vz * dtSec;
    }
    return true;
  }
  for (let i = 0; i < buffer.length - 1; i += 1) {
    const a = buffer[i]!;
    const b = buffer[i + 1]!;
    if (renderTime >= a.t && renderTime <= b.t) {
      const span = b.t - a.t;
      const t = span > 0 ? (renderTime - a.t) / span : 0;
      out.x = a.x + (b.x - a.x) * t;
      out.y = a.y + (b.y - a.y) * t;
      out.z = a.z + (b.z - a.z) * t;
      out.yaw = lerpAngle(a.yaw, b.yaw, t);
      nlerpQuat(out, a, b, t);
      out.speed = a.speed + (b.speed - a.speed) * t;
      out.vx = a.vx + (b.vx - a.vx) * t;
      out.vz = a.vz + (b.vz - a.vz) * t;
      out.spinnerRpm = a.spinnerRpm + (b.spinnerRpm - a.spinnerRpm) * t;
      // Здоровье/жизнь — дискретные, берём из более позднего снимка.
      out.health = b.health;
      out.alive = b.alive;
      return true;
    }
  }
  copyInto(out, last);
  return true;
}

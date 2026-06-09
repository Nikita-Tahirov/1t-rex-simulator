/**
 * Реестр текущих поз боевых роботов (module-level, как `sharedRefs` для одиночки).
 *
 * Локальный робот пишет сюда свою позу каждый кадр; хук интерполяции — позы
 * соперников. Локальный контроллер читает чужие записи для расталкивания и урона.
 * Обновления in-place, чтобы не аллоцировать в hot-path (инвариант проекта).
 */

export interface BattlePose {
  x: number;
  z: number;
  yaw: number;
  /** Линейная скорость, м/с — нужна для симметричного расчёта скорости сближения. */
  speed: number;
  alive: boolean;
}

export const battlePoses = new Map<string, BattlePose>();

export function setBattlePose(
  uid: string,
  x: number,
  z: number,
  yaw: number,
  speed: number,
  alive: boolean,
): void {
  const existing = battlePoses.get(uid);
  if (existing) {
    existing.x = x;
    existing.z = z;
    existing.yaw = yaw;
    existing.speed = speed;
    existing.alive = alive;
  } else {
    battlePoses.set(uid, { x, z, yaw, speed, alive });
  }
}

export function removeBattlePose(uid: string): void {
  battlePoses.delete(uid);
}

export function clearBattlePoses(): void {
  battlePoses.clear();
}

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
  /** Линейная скорость, м/с — нужна для расчёта скорости сближения/тарана. */
  speed: number;
  /** Обороты спиннера, об/мин — для визуального вращения ротора призрака. */
  spinnerRpm: number;
  alive: boolean;
}

export const battlePoses = new Map<string, BattlePose>();

export function setBattlePose(
  uid: string,
  x: number,
  z: number,
  yaw: number,
  speed: number,
  spinnerRpm: number,
  alive: boolean,
): void {
  const existing = battlePoses.get(uid);
  if (existing) {
    existing.x = x;
    existing.z = z;
    existing.yaw = yaw;
    existing.speed = speed;
    existing.spinnerRpm = spinnerRpm;
    existing.alive = alive;
  } else {
    battlePoses.set(uid, { x, z, yaw, speed, spinnerRpm, alive });
  }
}

export function removeBattlePose(uid: string): void {
  battlePoses.delete(uid);
}

export function clearBattlePoses(): void {
  battlePoses.clear();
}

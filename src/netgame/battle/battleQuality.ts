/**
 * Адаптивное качество боевой сцены для слабого железа и мобильных.
 *
 * В отличие от одиночной сцены, бой НЕ участвует в `scenario:export`, поэтому
 * здесь допустимо менять DPR/тени в рантайме (детерминизм физики не требуется —
 * см. `SceneQuality`). Стартовый уровень берём по лёгкой эвристике (без тяжёлой
 * detect-gpu базы), а дальше DPR подстраивает `PerformanceMonitor` по реальному FPS.
 */

export interface BattleQuality {
  /** Включить shadow map (самая дорогая статья на слабых GPU). */
  shadows: boolean;
  /** Размер shadow map (бой: меньше одиночной 2048² — это геймплей, не слайды). */
  shadowMapSize: number;
  /** Верхняя граница DPR (нижнюю подбирает PerformanceMonitor). */
  maxDpr: number;
  antialias: boolean;
}

export interface DeviceHint {
  mobile: boolean;
  cores: number;
}

/** Лёгкая эвристика «слабого» устройства без сетевых/тяжёлых зависимостей. */
export function detectDevice(): DeviceHint {
  if (typeof navigator === 'undefined') return { mobile: false, cores: 8 };
  return {
    mobile: /Mobi|Android|iP(hone|ad|od)/i.test(navigator.userAgent),
    cores: navigator.hardwareConcurrency ?? 8,
  };
}

/** Стартовое качество боя по устройству. Мобильные/малоядерные — без теней. */
export function initialBattleQuality(device: DeviceHint): BattleQuality {
  const lowEnd = device.mobile || device.cores <= 4;
  if (lowEnd) {
    return { shadows: false, shadowMapSize: 1024, maxDpr: 1, antialias: false };
  }
  return { shadows: true, shadowMapSize: 1024, maxDpr: 1.25, antialias: true };
}

/** Нижняя граница DPR при сильной просадке FPS. */
export const MIN_BATTLE_DPR = 0.6;

/** DPR из фактора PerformanceMonitor (0..1) в диапазон [MIN_BATTLE_DPR, maxDpr]. */
export function dprFromFactor(factor: number, maxDpr: number): number {
  const clamped = Math.max(0, Math.min(1, factor));
  const dpr = MIN_BATTLE_DPR + (maxDpr - MIN_BATTLE_DPR) * clamped;
  return Math.round(dpr * 100) / 100;
}

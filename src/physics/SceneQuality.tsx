import { Preload } from '@react-three/drei/core/Preload.js';

/**
 * Runtime-quality слой: новые визуальные фичи не должны ломать demo-FPS.
 *
 * **Preload all** — заранее загружает текстуры/материалы, чтобы первый
 * проход не затыкался JIT-загрузкой.
 *
 * **Почему ¬ AdaptiveDpr / PerformanceMonitor**: оба адаптивных подхода меняют
 * `gl.setPixelRatio()` в hot path → R3F пересоздаёт internal RT, теряется кадр
 * → physics tick пропускается → headless scenario:export ловит ложный
 * «телепорт» по `maxSegmentSpeedMps` и фейлит проверку пути. Фиксированный DPR
 * предсказуем и даёт стабильную физику для ВКР-доказательной части. Если в
 * будущем понадобится adaptive — гейтить через флаг scenario-export
 * (`window.__sceneStable = true`) и отключать PerformanceMonitor.
 *
 * **Почему ¬ BakeShadows**: `BakeShadows` отключает `gl.shadowMap.autoUpdate`
 * после первого кадра. Это корректно для статической сцены, но в нашем
 * симуляторе **робот ездит, ротор крутится, ящики падают** — тень должна
 * перерисовываться каждый кадр. Запекание давало пиксельный «припекшийся»
 * след под роботом и тень, отстающую при движении. Стоимость shadow-pass
 * снижена другим путём: shadow-map 1024² + PCFSoft (см. `SceneLighting`).
 */
export function SceneQuality() {
  return <Preload all />;
}

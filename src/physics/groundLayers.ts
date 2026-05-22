/**
 * Y-стэк напольных декоративных слоёв арены.
 *
 * Каждый слой получает уникальную высоту с шагом ≥ 5 мм, чтобы избежать
 * Z-fighting при наклонной камере. Это **второй уровень защиты** в
 * дополнение к `polygonOffset` материалов: фиксирует порядок отрисовки
 * даже при ошибках polygon-offset на отдельных GPU.
 *
 * Все ground-маркеры в проекте обязаны брать Y из этого реестра.
 *
 * **Иерархия (снизу вверх)**:
 *   floor (0)              — основа арены, opaque, receiveShadow
 *   gridHelper (0.001)     — сетка сцены (App.tsx)
 *   floorPanel (0.010)     — четыре цветные плиты-зоны
 *   hazardPerimeter (0.012)— hazard-полосы по краю арены (Industrial)
 *   arenaRing (0.015)      — концентрические кольца центра
 *   arenaAxis (0.020)      — линии X/Z через всю арену
 *   sectorStencil (0.022)  — крупная служебная надпись на полу
 *   zoneMarker (0.025)     — буквы зон A/B/C/D, ZoneMarker outer ring
 *   sceneMarker (0.030)    — стартовые/финишные кольца сценариев
 *   coneBase (0.035)       — оранжевая «зона запрета» вокруг конусов
 */
export const GROUND_LAYER_Y = {
  floorPanel: 0.01,
  hazardPerimeter: 0.012,
  arenaRing: 0.015,
  arenaAxis: 0.02,
  sectorStencil: 0.022,
  zoneMarker: 0.025,
  sceneMarker: 0.03,
  coneBase: 0.035,
} as const;

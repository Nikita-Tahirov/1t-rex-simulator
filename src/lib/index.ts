/**
 * @packageDocumentation
 * Общие утилиты 1T-REX без зависимостей от React/Rapier/DOM.
 *
 * - `clamp` — единственный канонический источник в проекте. Локальные копии
 *   запрещены инвариантом проекта, чтобы поведение в physics/sensors/scenarios
 *   оставалось идентичным до бита.
 * - `createRafSampler` — обёртка для `requestAnimationFrame`-сэмплирования
 *   высокочастотных valtio-источников в React-компоненты HUD без warning
 *   «Cannot update component while rendering another» в React 19.
 */

export { createRafSampler } from './createRafSampler.ts';
export { clamp } from './math.ts';

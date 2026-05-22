/**
 * @packageDocumentation
 * Декларативные типы геометрии арены 1T-REX. Описывают данные, потребляемые
 * `ArenaPrimitives.tsx`, `ArenaZones.tsx`, `ShredderZone.tsx` и тестами
 * `arenaData.test.ts` / `rampGeometry.test.ts`. Координаты — в метрах, оси
 * соответствуют three.js (Y вверх). Цвета вынесены в `@/theme/tokens.ts`.
 */

/** Пара координат `[x, z]` или ширина/глубина в горизонтальной плоскости. */
export type Vec2 = [number, number];

/** Тройка координат `[x, y, z]` либо half-extents AABB в метрах. */
export type Vec3 = [number, number, number];

/** Идентификатор одной из четырёх зон арены: шредер/коробки/гараж/мост. */
export type ArenaZoneId = 'A' | 'B' | 'C' | 'D';

/**
 * Направление "вверх" по нормали наклонного клина. Используется для рассчёта
 * локального вектора подъёма в `rampGeometry.ts` и corresponding визуала.
 */
export type RampDirection = 'posX' | 'negX' | 'posZ' | 'negZ';

/** Один напольный декор-сегмент: цвет и прозрачность чисто визуальные, без физики. */
export interface FloorPanelDef {
  id: string;
  color: string;
  opacity: number;
  position: Vec3;
  size: Vec2;
}

/** Опорная ось арены (X или Z), отрисовываемая через `ArenaPrimitives`. */
export interface ArenaAxisDef {
  id: string;
  color: string;
  rotation: number;
}

/** Сегмент периметра арены: fixed-стена с half-extents AABB. */
export interface WallDef {
  id: string;
  position: Vec3;
  half: Vec3;
}

/**
 * Статический блок (post/tooth/rail) — fixed RigidBody с CuboidCollider,
 * визуально подсвечиваемый через `emissive`. Не движется и не получает урон.
 */
export interface StaticBlockDef {
  id: string;
  position: Vec3;
  half: Vec3;
  color: string;
  emissive?: string;
  opacity?: number;
  rotation?: Vec3;
}

/**
 * Клиновидный пандус (sector-entry или bridge-access). Визуальная геометрия
 * совпадает с физической через `ConvexHullCollider` в `rampGeometry.ts`, поэтому
 * шасси въезжает на пандус по реальной нормали, не «зацепляясь» за невидимую коробку.
 */
export interface RampBlockDef {
  id: string;
  zone: ArenaZoneId;
  kind: 'sector-entry' | 'bridge-access';
  position: Vec3;
  size: Vec3;
  direction: RampDirection;
  color: string;
  emissive?: string;
  opacity?: number;
  friction?: number;
  restitution?: number;
}

/**
 * Разрушаемая коробка зоны B: dynamic RigidBody с CCD и локальным health.
 * Удаляется после превышения порога урона; см. `crateDamage.ts`.
 */
export interface DamageCrateDef {
  id: string;
  position: Vec3;
  size: Vec3;
  color: string;
}

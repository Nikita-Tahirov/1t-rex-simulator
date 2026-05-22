/**
 * Коллизионные группы Rapier для робота 1T-REX.
 *
 * Rapier использует 32-битную битовую маску: верхние 16 бит — membership (в каких
 * группах состоит коллайдер), нижние 16 — filter (с какими группами сталкивается).
 * Контакт регистрируется только если выполнено `(A.mem ∩ B.fil) ∧ (B.mem ∩ A.fil)`.
 *
 * @react-three/rapier предоставляет хелпер `interactionGroups(memberships, filters)`,
 * который собирает bitmask из числовых ID (0..15).
 *
 * **Зачем это нужно:** части робота (корпус, колёса, диск ротора) соединены
 * физическими шарнирами Rapier. Без групп их коллайдеры попадают в узкую фазу
 * и иногда оказываются во взаимном проникновении — приходит постоянная контактная сила,
 * которая трясёт корпус. Особенно сильно проявляется с ротором: диск
 * вращается на 7 000 об/мин, и любой контакт с корпусом → высокочастотные
 * импульсы, передаваемые через корпус на всё шасси.
 *
 * Решение: корпус / колёса / диск ротора помещаем в свои группы и фильтруем
 * так, чтобы они сталкивались только с объектами арены (Arena = группа 0,
 * это группа Rapier по умолчанию для всех тел без явных настроек).
 *
 * Источники:
 * - https://rapier.rs/docs/user_guides/javascript/collider_collision_groups/
 * - https://github.com/pmndrs/react-three-rapier (interactionGroups helper)
 */

import { interactionGroups } from '@react-three/rapier';

export const CollisionGroup = {
  /** Группа Rapier по умолчанию (бит 0). Сюда попадают пол, стены, объекты арены —
   * всё, что не задано явно. */
  Arena: 0,
  /** Корпус робота (chassis cuboid). */
  Chassis: 1,
  /** 4 ходовых колеса. */
  Wheels: 2,
  /** Диск вертикального ротора. */
  Spinner: 3,
  /** Наклонные wedge-рампы (sector-entry и bridge-access).
   *
   * Высота шасси и колёс полностью задаётся pose-driver на основе
   * `terrainHeightAt` (см. `robotGroundPose.ts`); физический контакт wedge
   * collider'а с шасси создавал ghost-contact на наклонной грани и боковую
   * push-back силу — «невидимую стенку» на въезде на мост.
   *
   * Помещаем wedge-рампы в эту группу и исключаем их из фильтра шасси и
   * колёс. Динамические объекты арены (ящики) остаются взаимодействующими
   * с поверхностью, потому что у них фильтр по умолчанию (все группы).
   *
   * Источник: Rapier docs «Advanced collision detection» + ghost-contact
   * issue на trimesh/wedge внутри convex hull (dimforge/rapier#417, #331).
   */
  RampSurface: 4,
} as const;

/** Корпус робота сталкивается только с ареной. С колёсами и диском — нет
 * (joint-ы держат их вместе, физический контакт не нужен). С wedge-рампами
 * тоже нет: их Y контролирует pose-driver, физическая реакция паразитная. */
export const CHASSIS_COLLISION_GROUPS = interactionGroups(CollisionGroup.Chassis, [
  CollisionGroup.Arena,
]);

/** Колёса сталкиваются только с ареной (для трения о пол). Wedge-рампы
 * исключены по той же причине, что и для шасси. */
export const WHEELS_COLLISION_GROUPS = interactionGroups(CollisionGroup.Wheels, [
  CollisionGroup.Arena,
]);

/** Диск ротора сталкивается только с ареной (для будущего применения
 * урона по другим телам арены). */
export const SPINNER_COLLISION_GROUPS = interactionGroups(CollisionGroup.Spinner, [
  CollisionGroup.Arena,
]);

/** Wedge-рампы арены: видимы для динамики арены (ящики, мусор), но
 * прозрачны для шасси/колёс/диска робота. */
export const RAMP_COLLISION_GROUPS = interactionGroups(CollisionGroup.RampSurface, [
  CollisionGroup.Arena,
]);

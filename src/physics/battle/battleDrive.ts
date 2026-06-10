/**
 * Привод динамического боевого шасси (skid-steer / гусеничного типа).
 *
 * Робот 1T-REX поворачивает разностью бортов, а не рулём, поэтому «автомобильный»
 * raycast-vehicle (моделирует Ackermann-руль + боковое сцепление) ему не подходит.
 * Вместо этого ведём ДИНАМИЧЕСКОЕ тело шасси ограниченными силой/моментом:
 *  - продольная тяга подгоняет скорость к целевой (P-контур, но сила ОГРАНИЧЕНА →
 *    удары/наезды перекидывают робота, а не «вклеивают» его в целевую скорость);
 *  - момент по рысканью подгоняет угловую скорость к целевой (тоже ограничен);
 *  - боковое сцепление гасит занос (имитация трения катков), но не полностью —
 *    сильный таран сдвигает вбок.
 * Тело остаётся свободным по вертикали/наклону → инерция массы, опрокидывание и
 * заклинивание выпадают из реальной физики Rapier. Чистая функция (тестируется).
 */

export interface DriveState {
  /** Проекция линейной скорости на нос робота, м/с. */
  forwardSpeed: number;
  /** Проекция линейной скорости на правый борт, м/с. */
  lateralSpeed: number;
  /** Угловая скорость по рысканью (вокруг Y), рад/с. */
  yawRate: number;
}

export interface DriveInput {
  /** Газ [-1..1]. */
  throttle: number;
  /** Поворот [-1..1] (право = +). */
  turn: number;
  /** Тормоз [0..1]. */
  brake: number;
}

export interface DriveParams {
  mass: number;
  /** Момент инерции по рысканью (оценка), кг·м². */
  yawInertia: number;
  maxSpeed: number;
  maxYawRate: number;
  /** Предел продольной силы привода, Н (ограничивает «вклейку» → удары проходят). */
  driveForceMax: number;
  /** Предел момента поворота, Н·м. */
  turnTorqueMax: number;
  /** Доля боковой скорости, гасимой в секунду (0..~20) — сцепление катков. */
  lateralGrip: number;
  /** Множитель мощности от повреждений [0..1]. */
  driveScale: number;
}

export interface DriveOutput {
  /** Сила вдоль носа, Н (для импульса force·dt). */
  forwardForce: number;
  /** Боковая сила (анти-занос), Н. */
  lateralForce: number;
  /** Момент по рысканью, Н·м. */
  yawTorque: number;
}

const RESPONSE_TAU = 0.18;
// Жёсткий контур рыскания: трение пола о широкое шасси создаёт момент
// сопротивления, поэтому контроллер должен выдавать заметный момент, иначе робот
// «не докручивает» до целевой угловой скорости (skid-turn).
const YAW_RESPONSE_TAU = 0.045;

function clampAbs(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Силы/момент привода за кадр. Не интегрирует — это делает Rapier; здесь только
 * целевые силы из текущего состояния, ввода и ТТХ (ограниченные → физика рулит).
 * Силы dt-независимы; импульс `force·dt` накладывает вызывающий.
 */
export function computeDriveForces(
  state: DriveState,
  input: DriveInput,
  params: DriveParams,
): DriveOutput {
  const braking = input.brake > 0;
  const targetSpeed = braking ? 0 : input.throttle * params.maxSpeed * params.driveScale;
  const targetYawRate = braking ? 0 : input.turn * params.maxYawRate * params.driveScale;

  const forwardForce = clampAbs(
    ((targetSpeed - state.forwardSpeed) * params.mass) / RESPONSE_TAU,
    params.driveForceMax,
  );
  const yawTorque = clampAbs(
    ((targetYawRate - state.yawRate) * params.yawInertia) / YAW_RESPONSE_TAU,
    params.turnTorqueMax,
  );
  // Анти-занос: тянем боковую скорость к нулю, но ограниченной силой (таран сдвигает).
  const lateralForce = clampAbs(
    -state.lateralSpeed * params.mass * params.lateralGrip,
    params.driveForceMax,
  );

  return { forwardForce, lateralForce, yawTorque };
}

/**
 * @packageDocumentation
 * Контурный слой 1T-REX — чистые TypeScript-модели без зависимостей от DOM, React
 * и Rapier. Спроектирован под прямой перенос на C/C++-прошивку МК МИК32 «Амур»:
 * замена `number` на `float`, подстановка реальных HAL-вызовов вместо виртуальных
 * датчиков, сохранение имён переходов FSM и сигнатур ПИД-регулятора.
 *
 * Состав: PID-регулятор скоростей колёс, модель щёточного мотора с EMF-обратной
 * связью, 12S Li-Po АКБ с brownout-просадкой напряжения, 4WD skid-steer-привод,
 * объединяющий 4×PID + 4×Motor + 1×Battery в детерминированный шаг dt = 1/60 с.
 *
 * Public surface этого barrel-файла — единственный заявленный контракт модуля.
 * Прямые импорты из подфайлов (`./pid.ts` и т.п.) разрешены, но `index.ts`
 * остаётся источником истины для документации и `npm run typecheck`.
 *
 * @see [docs/architecture.md](../../docs/architecture.md) — слойная декомпозиция.
 * @see [docs/models.md](../../docs/models.md) — физико-математические модели.
 */

export type { BatteryParams, BatteryState } from './battery.ts';
export { BatteryModel } from './battery.ts';

export type { DrivetrainParams, DrivetrainStep, WheelIndex } from './drivetrain.ts';
export { Drivetrain4WD } from './drivetrain.ts';

export type { MotorParams, MotorState } from './motor.ts';
export { MotorModel } from './motor.ts';

export type { PIDParams, PIDState } from './pid.ts';
export { PIDController } from './pid.ts';

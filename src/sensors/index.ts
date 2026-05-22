/**
 * @packageDocumentation
 * Сенсорный слой 1T-REX — виртуальные датчики (IMU, энкодеры, лидар) и фильтры
 * оценки ориентации (комплементарный, Madgwick). Все модели — чистый TypeScript,
 * сценарий шума параметризуется через интерфейсы `*NoiseSpec`. Сравнительный
 * эксперимент `madgwickVsComplementary` использует оба фильтра на одной IMU-серии.
 *
 * `lidar` — единственный модуль, экспортирующий разделяемый valtio-proxy
 * (высокочастотная телеметрия лидара). Остальные классы безсостоятельны
 * для тестируемости и переноса в прошивку.
 *
 * @see [docs/models.md](../../docs/models.md) — параметры шума и калибровка фильтров.
 */

export type {
  ComplementaryFilterParams,
  IMUSample,
  OrientationEstimate,
} from './complementary-filter.ts';
export { ComplementaryFilter } from './complementary-filter.ts';

export type { EncoderParams, EncoderState } from './encoder-sensor.ts';
export { EncoderSensor } from './encoder-sensor.ts';

export type { IMUNoiseSpec, IMUTrueSample } from './imu-sensor.ts';
export { IMUSensor } from './imu-sensor.ts';

export type { LidarFrame } from './lidar.ts';
export {
  LIDAR_BEAM_ANGLES,
  LIDAR_BEAM_COUNT,
  LIDAR_BEAM_HEIGHT_M,
  LIDAR_FOV_RAD,
  LIDAR_MAX_RANGE_M,
  lidar,
  resetLidar,
} from './lidar.ts';

export type { IMU6DOFSample, MadgwickParams, Quaternion } from './madgwick-filter.ts';
export { MadgwickFilter } from './madgwick-filter.ts';

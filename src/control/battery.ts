/**
 * Модель литий-полимерной аккумуляторной сборки 12S (44.4 В номинал) для 1T-REX.
 *
 * Источник параметров: справка о роботе для регистрации на «Битве роботов»
 * («Максимальное напряжение в роботе 44.4 В (12S сборка)»).
 *
 * Учитывается:
 *   • OCV-кривая в функции SOC (упрощённая кусочно-линейная для 12S Li-Po)
 *   • Внутреннее сопротивление r → просадка под нагрузкой: V_load = OCV − I·r
 *   • Расход ёмкости через ток
 *   • Тепловыделение I²·r (без обратного влияния на r — упрощение)
 *
 * Допущения, отмеченные в ВКР:
 *   • Постоянная r во всём диапазоне SOC (реально r растёт при разряде)
 *   • Без модели температурной зависимости ёмкости
 *   • OCV — гладкая аппроксимация без плато заряда CC/CV
 */

export interface BatteryParams {
  /** Кол-во последовательных банок (для 12S = 12). */
  seriesCells: number;
  /** Номинальная ёмкость, А·ч. */
  capacityAh: number;
  /** Начальный SOC ∈ [0, 1]. */
  initialSoc?: number;
  /** Внутреннее сопротивление сборки, Ом. По умолчанию 0.3 (≈25 мОм/банка × 12). */
  internalResistance?: number;
  /** Тепловая ёмкость сборки, Дж/К. */
  heatCapacity?: number;
  /** Коэффициент теплоотвода в среду, Вт/К. */
  thermalConductance?: number;
  /** Температура окружающей среды, °C. */
  ambientTemperatureC?: number;
}

export interface BatteryState {
  soc: number;
  voltageOpen: number;
  voltageLoad: number;
  current: number;
  temperatureC: number;
  energyDeliveredJ: number;
}

/** OCV одной банки Li-Po как функция SOC (упрощённая аппроксимация, [3.0..4.2] В). */
function cellOcv(soc: number): number {
  const s = Math.max(0, Math.min(1, soc));
  // Кусочно-линейная: 3.0 при 0%, 3.5 при 10%, 3.7 при 30%, 3.85 при 60%, 4.1 при 90%, 4.2 при 100%
  const points: Array<[number, number]> = [
    [0.0, 3.0],
    [0.1, 3.5],
    [0.3, 3.7],
    [0.6, 3.85],
    [0.9, 4.1],
    [1.0, 4.2],
  ];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b && s <= b[0]) {
      const t = (s - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return 4.2;
}

export class BatteryModel {
  private readonly cells: number;
  private readonly capacityAs: number; // в ампер-секундах для удобства
  private readonly r: number;
  private readonly heatCapacity: number;
  private readonly thermalConductance: number;
  private readonly ambient: number;

  private soc: number;
  private temperatureC: number;
  private current = 0;
  private voltageOpen: number;
  private voltageLoad: number;
  private energyDeliveredJ = 0;

  constructor(params: BatteryParams) {
    this.cells = params.seriesCells;
    this.capacityAs = params.capacityAh * 3600;
    this.soc = params.initialSoc ?? 1.0;
    this.r = params.internalResistance ?? 0.3;
    this.heatCapacity = params.heatCapacity ?? 4000;
    this.thermalConductance = params.thermalConductance ?? 1.5;
    this.ambient = params.ambientTemperatureC ?? 22;
    this.temperatureC = this.ambient;
    this.voltageOpen = this.cells * cellOcv(this.soc);
    this.voltageLoad = this.voltageOpen;
  }

  /**
   * Шаг модели.
   * @param current Ток нагрузки, А (положительный = разряд)
   * @param dt Шаг времени, с
   */
  step(current: number, dt: number): BatteryState {
    if (dt < 0) throw new RangeError('dt must be ≥ 0');
    this.current = current;

    // Расход заряда
    const charge = current * dt;
    this.soc = Math.max(0, Math.min(1, this.soc - charge / this.capacityAs));

    // Напряжение
    this.voltageOpen = this.cells * cellOcv(this.soc);
    this.voltageLoad = Math.max(0, this.voltageOpen - current * this.r);

    // Энергия, отданная в нагрузку (V_load × I × dt)
    if (current > 0) this.energyDeliveredJ += this.voltageLoad * current * dt;

    // Тепло: P_loss = I²·r. Учёт теплоотвода первого порядка.
    const dissipated = current * current * this.r;
    const heatFlowOut = this.thermalConductance * (this.temperatureC - this.ambient);
    const dT = ((dissipated - heatFlowOut) * dt) / this.heatCapacity;
    this.temperatureC += dT;

    return this.snapshot();
  }

  snapshot(): BatteryState {
    return {
      soc: this.soc,
      voltageOpen: this.voltageOpen,
      voltageLoad: this.voltageLoad,
      current: this.current,
      temperatureC: this.temperatureC,
      energyDeliveredJ: this.energyDeliveredJ,
    };
  }

  /** Состояние «разряжен» (для перехода робота в SAFE-mode). */
  isDepleted(thresholdSoc = 0.05): boolean {
    return this.soc <= thresholdSoc;
  }
}

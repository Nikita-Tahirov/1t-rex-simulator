/**
 * Фильтр Маджвика — оценка ориентации (кватернион) из 6-DOF IMU.
 *
 * Используется в сравнении с комплементарным фильтром в главе ВКР про сенсорную
 * фильтрацию. Преимущество над комплементарным: явный yaw (через интегрирование
 * gz) и более стабильная сходимость по углам крена/тангажа при манёврах.
 *
 * Источник алгоритма: Madgwick S.O.H., 2010 (стандартная open-source имплементация).
 *
 * Параметр β — gain градиентного спуска. Типичные значения 0.05..0.1.
 */

export interface MadgwickParams {
  /** Коэффициент градиентного спуска (gain). */
  beta: number;
}

export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface IMU6DOFSample {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export class MadgwickFilter {
  private q: Quaternion = { w: 1, x: 0, y: 0, z: 0 };
  private readonly beta: number;

  constructor(params: MadgwickParams) {
    if (params.beta < 0) throw new RangeError('beta must be ≥ 0');
    this.beta = params.beta;
  }

  reset(): void {
    this.q = { w: 1, x: 0, y: 0, z: 0 };
  }

  update(s: IMU6DOFSample, dt: number): Quaternion {
    if (dt <= 0) return { ...this.q };
    let { w: q1, x: q2, y: q3, z: q4 } = this.q;

    // Шаг 1: интегрирование угловой скорости (qdot от гироскопа)
    const qDot1 = 0.5 * (-q2 * s.gx - q3 * s.gy - q4 * s.gz);
    const qDot2 = 0.5 * (q1 * s.gx + q3 * s.gz - q4 * s.gy);
    const qDot3 = 0.5 * (q1 * s.gy - q2 * s.gz + q4 * s.gx);
    const qDot4 = 0.5 * (q1 * s.gz + q2 * s.gy - q3 * s.gx);

    // Шаг 2: коррекция от акселерометра (если |a| ≠ 0)
    const accelMag = Math.hypot(s.ax, s.ay, s.az);
    let dq1 = qDot1;
    let dq2 = qDot2;
    let dq3 = qDot3;
    let dq4 = qDot4;
    if (accelMag > 1e-6) {
      const ax = s.ax / accelMag;
      const ay = s.ay / accelMag;
      const az = s.az / accelMag;
      const f1 = 2 * (q2 * q4 - q1 * q3) - ax;
      const f2 = 2 * (q1 * q2 + q3 * q4) - ay;
      const f3 = 2 * (0.5 - q2 * q2 - q3 * q3) - az;
      const J11 = -2 * q3;
      const J12 = 2 * q4;
      const J13 = -2 * q1;
      const J14 = 2 * q2;
      const J21 = 2 * q2;
      const J22 = 2 * q1;
      const J23 = 2 * q4;
      const J24 = 2 * q3;
      const J32 = -4 * q2;
      const J33 = -4 * q3;
      let s1 = J11 * f1 + J21 * f2;
      let s2 = J12 * f1 + J22 * f2 + J32 * f3;
      let s3 = J13 * f1 + J23 * f2 + J33 * f3;
      let s4 = J14 * f1 + J24 * f2;
      const norm = Math.hypot(s1, s2, s3, s4) || 1;
      s1 /= norm;
      s2 /= norm;
      s3 /= norm;
      s4 /= norm;
      dq1 -= this.beta * s1;
      dq2 -= this.beta * s2;
      dq3 -= this.beta * s3;
      dq4 -= this.beta * s4;
    }

    q1 += dq1 * dt;
    q2 += dq2 * dt;
    q3 += dq3 * dt;
    q4 += dq4 * dt;
    const n = Math.hypot(q1, q2, q3, q4) || 1;
    this.q = { w: q1 / n, x: q2 / n, y: q3 / n, z: q4 / n };
    return { ...this.q };
  }

  /** Углы Эйлера (roll, pitch, yaw) из кватерниона, рад. */
  toEuler(): { roll: number; pitch: number; yaw: number } {
    const { w, x, y, z } = this.q;
    const sinr = 2 * (w * x + y * z);
    const cosr = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr, cosr);
    const sinp = 2 * (w * y - z * x);
    const pitch = Math.abs(sinp) >= 1 ? (Math.PI / 2) * Math.sign(sinp) : Math.asin(sinp);
    const siny = 2 * (w * z + x * y);
    const cosy = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny, cosy);
    return { roll, pitch, yaw };
  }
}

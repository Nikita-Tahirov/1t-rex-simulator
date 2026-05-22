import { useEffect, useRef } from 'react';
import { ARENA } from '@/physics/constants.ts';
import { telemetry } from '@/store/telemetry.ts';
import { useTelemetryField } from '@/store/useTelemetryFrame.ts';

/**
 * Мини-карта арены (X в плоскости, Z — вглубь). Отрисовка в canvas 2D.
 * Показывает текущую позицию робота и след за последние 5 секунд.
 *
 * Optimized 2026-05:
 *   • Статичный фон (заливка + сетка + рамка) рендерится один раз в OffscreenCanvas
 *     при ресайзе, а в hot-loop'е блитится через `drawImage()` — снимаем 36 grid-линий
 *     × 60 Hz = 2160 path-операций/сек.
 *   • Trail-семплер 20 Гц использует ring buffer Float32Array вместо `.push/.shift`
 *     (избегаем O(n)-сдвига и аллокаций объектов-точек).
 *   • Канва перерисовывается только когда поза робота изменилась с прошлого кадра
 *     или появилась новая trail-точка — иначе RAF-кадр пропускается.
 */
const TRAIL_SECONDS = 5;
const SAMPLE_HZ = 20;
const TRAIL_LEN = TRAIL_SECONDS * SAMPLE_HZ;
const MAP_GRID_CELLS = ARENA.size;
const POSE_EPSILON = 1e-4;

type Any2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function get2DContext(bg: OffscreenCanvas | HTMLCanvasElement): Any2DContext | null {
  // OffscreenCanvas.getContext и HTMLCanvasElement.getContext имеют разные
  // overload-сигнатуры, и TS возвращает union, включающий ImageBitmapRenderingContext.
  // Здесь явно запрашиваем '2d' и приводим к 2D-семейству — оба варианта 2D
  // предоставляют одинаковый набор используемых методов.
  return bg.getContext('2d') as Any2DContext | null;
}

function paintStaticBackground(
  bg: OffscreenCanvas | HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  const ctx = get2DContext(bg);
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = '#10091d';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= MAP_GRID_CELLS; i++) {
    const p = (i / MAP_GRID_CELLS) * cssW;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, cssH);
    ctx.stroke();
    const py = (i / MAP_GRID_CELLS) * cssH;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(cssW, py);
    ctx.stroke();
  }
  ctx.strokeStyle = '#4cbcff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, cssW - 2, cssH - 2);
}

function makeBackgroundCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const fallback = document.createElement('canvas');
  fallback.width = width;
  fallback.height = height;
  return fallback;
}

export function MiniMap() {
  const posX = useTelemetryField('positionX');
  const posZ = useTelemetryField('positionZ');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const trailX = new Float32Array(TRAIL_LEN);
    const trailZ = new Float32Array(TRAIL_LEN);
    let trailHead = 0;
    let trailFilled = 0;
    let lastSampleAt = 0;
    let lastPaintX = NaN;
    let lastPaintZ = NaN;
    let lastPaintYaw = NaN;
    let lastTrailHead = -1;

    let background: OffscreenCanvas | HTMLCanvasElement | null = null;
    let bgWidth = 0;
    let bgHeight = 0;
    let bgDpr = 0;
    let raf = 0;

    const ensureBackground = (cssW: number, cssH: number, dpr: number) => {
      if (
        background !== null &&
        bgWidth === cssW * dpr &&
        bgHeight === cssH * dpr &&
        bgDpr === dpr
      ) {
        return background;
      }
      const w = cssW * dpr;
      const h = cssH * dpr;
      if (!background || bgWidth !== w || bgHeight !== h) {
        background = makeBackgroundCanvas(w, h);
        bgWidth = w;
        bgHeight = h;
      }
      bgDpr = dpr;
      paintStaticBackground(background, cssW, cssH, dpr);
      return background;
    };

    const draw = (ts: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW <= 0 || cssH <= 0) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }

      let trailUpdated = false;
      if (ts - lastSampleAt >= 1000 / SAMPLE_HZ) {
        lastSampleAt = ts;
        trailX[trailHead] = telemetry.positionX;
        trailZ[trailHead] = telemetry.positionZ;
        trailHead = (trailHead + 1) % TRAIL_LEN;
        if (trailFilled < TRAIL_LEN) trailFilled++;
        trailUpdated = true;
      }

      const curX = telemetry.positionX;
      const curZ = telemetry.positionZ;
      const curYaw = telemetry.yaw;
      const poseChanged =
        !(
          Math.abs(curX - lastPaintX) < POSE_EPSILON &&
          Math.abs(curZ - lastPaintZ) < POSE_EPSILON &&
          Math.abs(curYaw - lastPaintYaw) < POSE_EPSILON
        ) || lastTrailHead !== trailHead;
      if (!poseChanged && !trailUpdated) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const bg = ensureBackground(cssW, cssH, dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const toScreenX = (x: number) => ((x + ARENA.size / 2) / ARENA.size) * cssW;
      const toScreenY = (z: number) => ((z + ARENA.size / 2) / ARENA.size) * cssH;

      if (trailFilled > 1) {
        ctx.strokeStyle = '#4cbcff';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        const start = trailFilled < TRAIL_LEN ? 0 : trailHead;
        const count = trailFilled;
        for (let i = 0; i < count; i++) {
          const idx = (start + i) % TRAIL_LEN;
          const x = toScreenX(trailX[idx] ?? 0);
          const y = toScreenY(trailZ[idx] ?? 0);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const rx = toScreenX(curX);
      const ry = toScreenY(curZ);
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(curYaw);
      ctx.fillStyle = '#ff4fc3';
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, 4);
      ctx.lineTo(-5, -4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      lastPaintX = curX;
      lastPaintZ = curZ;
      lastPaintYaw = curYaw;
      lastTrailHead = trailHead;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="block aspect-square w-full rounded-xl" />
      <span className="pointer-events-none absolute right-2 bottom-2 font-mono text-[10px] text-[var(--color-text-dim)]">
        x {posX.toFixed(2)} · z {posZ.toFixed(2)} · {ARENA.size}×{ARENA.size} м
      </span>
    </div>
  );
}

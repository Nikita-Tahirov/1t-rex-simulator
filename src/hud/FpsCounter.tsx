import { startTransition, useEffect, useState } from 'react';

const UPDATE_INTERVAL_MS = 500;

export function FpsCounter() {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frameId = 0;
    let frames = 0;
    let lastUpdate = performance.now();

    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - lastUpdate;

      if (elapsed >= UPDATE_INTERVAL_MS) {
        startTransition(() => setFps(Math.round((frames * 1000) / elapsed)));
        frames = 0;
        lastUpdate = now;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className="sim-floating-readout pointer-events-none absolute top-4 left-4 z-20 px-3 py-2 font-mono text-[11px] text-text-dim tabular-nums">
      <span className="font-semibold text-accent-cyan">КАДР/С</span>{' '}
      <span className={fps < 45 ? 'text-warn' : 'text-text'}>{fps}</span>
    </div>
  );
}

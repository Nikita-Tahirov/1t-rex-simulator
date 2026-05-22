interface RegisterServiceWorkerOptions {
  force?: boolean;
}

export function registerServiceWorker(options: RegisterServiceWorkerOptions = {}): void {
  if (!options.force && !import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline fallback is best-effort; the simulator must still start without SW.
      });
    },
    { once: true },
  );
}

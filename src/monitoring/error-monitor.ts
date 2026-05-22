export interface ErrorEventRecord {
  message: string;
  source: 'boundary' | 'error' | 'unhandledrejection';
  componentStack?: string;
  at: string;
}

const errorEvents: ErrorEventRecord[] = [];

declare global {
  interface Window {
    __errorEvents?: ErrorEventRecord[];
  }
}

export function installErrorMonitor(): void {
  window.__errorEvents = errorEvents;
  window.addEventListener('error', (event) => {
    captureError(event.error ?? event.message, 'error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, 'unhandledrejection');
  });
}

export function captureError(
  error: unknown,
  source: ErrorEventRecord['source'],
  componentStack?: string,
): void {
  const record: ErrorEventRecord = {
    message: error instanceof Error ? error.message : String(error),
    source,
    at: new Date().toISOString(),
  };
  if (componentStack !== undefined) record.componentStack = componentStack;
  errorEvents.push(record);
}

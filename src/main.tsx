import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './sim-ui.css';
import App from './App.tsx';
import { ErrorBoundary } from './monitoring/ErrorBoundary.tsx';
import { installErrorMonitor } from './monitoring/error-monitor.ts';
import { installPerformanceMonitor } from './monitoring/performance-monitor.ts';
import { registerServiceWorker } from './offline/register-service-worker.ts';
import {
  getShredderRotorAngle,
  setShredderRotorAngleOverride,
} from './physics/arena/shredderState.ts';
import { configureTextRendering } from './physics/configureTextRendering.ts';
import { useScenarioStore } from './store/scenario-store.ts';
import { useSimStore } from './store/sim-store.ts';
import { telemetry } from './store/telemetry.ts';

declare global {
  interface Window {
    __telemetry?: typeof telemetry;
    __simStore?: typeof useSimStore;
    __scenarioStore?: typeof useScenarioStore;
    __shredderRotor?: {
      getAngle: typeof getShredderRotorAngle;
      setAngleOverride: typeof setShredderRotorAngleOverride;
    };
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');
const mountNode = rootElement;

async function bootstrap() {
  configureTextRendering();

  // Экспонируем telemetry и стейты в window для e2e-тестов и dev-консоли.
  if (typeof window !== 'undefined') {
    window.__telemetry = telemetry;
    window.__simStore = useSimStore;
    window.__scenarioStore = useScenarioStore;
    window.__shredderRotor = {
      getAngle: getShredderRotorAngle,
      setAngleOverride: setShredderRotorAngleOverride,
    };
    installErrorMonitor();
    installPerformanceMonitor();
    registerServiceWorker();
  }

  createRoot(mountNode).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();

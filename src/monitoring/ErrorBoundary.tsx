import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from './error-monitor.ts';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, 'boundary', info.componentStack ?? undefined);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <main
        role="alert"
        className="grid min-h-screen place-items-center bg-bg px-6 text-center text-text"
      >
        <section className="max-w-md">
          <h1 className="text-xl font-bold">Симулятор остановлен</h1>
          <p className="mt-3 text-sm text-text-dim">{this.state.message}</p>
        </section>
      </main>
    );
  }
}

import { registerServiceWorker } from './register-service-worker.ts';

describe('service worker registration', () => {
  it('registers the offline fallback after page load when supported', () => {
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    registerServiceWorker({ force: true });
    window.dispatchEvent(new Event('load'));

    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('does not register in dev/test mode by default', () => {
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    registerServiceWorker();
    window.dispatchEvent(new Event('load'));

    expect(register).not.toHaveBeenCalled();
  });
});

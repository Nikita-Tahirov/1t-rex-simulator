import { waitForFirstTrue } from './firebaseClient.ts';

/**
 * Поведение триггера транспортного фолбэка: ждём первый `true` от подписки
 * на `.info/connected` либо таймаут. Отписка обязана происходить в обоих
 * исходах — иначе утекают onValue-слушатели при каждом пересоздании стека.
 */
describe('waitForFirstTrue — триггер фолбэка на long-polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('true пришёл до таймаута → resolve(true), подписка снята', async () => {
    let unsubscribed = false;
    let push: (value: boolean) => void = () => {};
    const result = waitForFirstTrue((callback) => {
      push = callback;
      return () => {
        unsubscribed = true;
      };
    }, 5000);
    push(false);
    push(true);
    await expect(result).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(unsubscribed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('синхронный true прямо из subscribe → resolve(true) без гонки с отпиской', async () => {
    let unsubscribed = false;
    const result = waitForFirstTrue((callback) => {
      callback(true);
      return () => {
        unsubscribed = true;
      };
    }, 5000);
    await expect(result).resolves.toBe(true);
    expect(unsubscribed).toBe(true);
  });

  it('только false до таймаута → resolve(false), подписка снята', async () => {
    let unsubscribed = false;
    let push: (value: boolean) => void = () => {};
    const result = waitForFirstTrue((callback) => {
      push = callback;
      return () => {
        unsubscribed = true;
      };
    }, 7000);
    push(false);
    await vi.advanceTimersByTimeAsync(7000);
    await expect(result).resolves.toBe(false);
    expect(unsubscribed).toBe(true);
  });

  it('поздний true после таймаута игнорируется (нет двойного resolve/утечки)', async () => {
    let push: (value: boolean) => void = () => {};
    const result = waitForFirstTrue((callback) => {
      push = callback;
      return () => {};
    }, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    push(true);
    await expect(result).resolves.toBe(false);
  });
});

import { withTimeout } from './withTimeout.ts';

describe('withTimeout — потолок ожидания сетевых операций порта', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('операция успевает — значение проброшено, таймер зачищен', async () => {
    const result = withTimeout(Promise.resolve('ok'), 1000, 'Операция');
    await expect(result).resolves.toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('операция висит — reject с понятным сообщением (label + причина + секунды)', async () => {
    const hang = new Promise<never>(() => {});
    const result = withTimeout(hang, 12_000, 'Создание комнаты');
    const assertion = expect(result).rejects.toThrow(
      'Создание комнаты: сервер не ответил за 12 с — проверьте сеть и блокировщики',
    );
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
  });

  it('исходная ошибка операции пробрасывается как есть, таймер зачищен', async () => {
    const result = withTimeout(Promise.reject(new Error('Комната заполнена')), 1000, 'Вход');
    await expect(result).rejects.toThrow('Комната заполнена');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('таймаут не срабатывает после успешного завершения', async () => {
    const result = withTimeout(Promise.resolve(42), 1000, 'Операция');
    await expect(result).resolves.toBe(42);
    await vi.advanceTimersByTimeAsync(5000);
    // Никаких необработанных rejection — промис уже разрешён.
  });
});

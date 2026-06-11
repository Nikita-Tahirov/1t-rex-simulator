// Исходник реального sw.js как строка (Vite `?raw`), без node-зависимостей —
// тест остаётся в browser-only типизации tsconfig.app.json.
import swSource from '../../public/sw.js?raw';

/**
 * Поведенческие тесты реального `public/sw.js`: файл исполняется в песочнице
 * с фейковыми Cache API и fetch, тесты дёргают зарегистрированные обработчики.
 *
 * Главный инвариант — кэш не отравляем: hosting переписывает отсутствующие
 * пути в index.html (200 text/html), и такой ответ НЕ должен кэшироваться под
 * URL ассета, иначе клиент перманентно получает HTML вместо JS-модуля и
 * лечится только ручной очисткой кэша браузера.
 */

const ORIGIN = 'https://rex-1t.web.app';
const maxAssetEntries = Number(/MAX_ASSET_ENTRIES = (\d+)/.exec(swSource)?.[1]);

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}

interface FakeResponse {
  ok: boolean;
  status: number;
  body: string;
  headers: { get(name: string): string | null };
  clone(): FakeResponse;
}

type FetchImpl = (request: FakeRequest) => Promise<FakeResponse>;

function abs(url: string): string {
  return new URL(url, ORIGIN).href;
}

function makeRequest(url: string, mode = 'no-cors', method = 'GET'): FakeRequest {
  return { url: url.startsWith('http') ? url : abs(url), method, mode };
}

function makeResponse(body: string, status: number, contentType: string): FakeResponse {
  const response: FakeResponse = {
    ok: status >= 200 && status < 300,
    status,
    body,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    clone: () => response,
  };
  return response;
}

class FakeCache {
  readonly store = new Map<string, FakeResponse>();

  async match(request: FakeRequest | string): Promise<FakeResponse | undefined> {
    return this.store.get(this.key(request));
  }

  async put(request: FakeRequest | string, response: FakeResponse): Promise<void> {
    this.store.set(this.key(request), response);
  }

  async addAll(urls: string[]): Promise<void> {
    for (const url of urls) this.store.set(abs(url), makeResponse('', 200, 'text/html'));
  }

  async keys(): Promise<Array<{ url: string }>> {
    return [...this.store.keys()].map((url) => ({ url }));
  }

  async delete(request: FakeRequest | string): Promise<boolean> {
    return this.store.delete(this.key(request));
  }

  private key(request: FakeRequest | string): string {
    return typeof request === 'string' ? abs(request) : request.url;
  }
}

class FakeCaches {
  readonly buckets = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      bucket = new FakeCache();
      this.buckets.set(name, bucket);
    }
    return bucket;
  }

  async keys(): Promise<string[]> {
    return [...this.buckets.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.buckets.delete(name);
  }
}

/** Единый стаб событий install/activate/fetch: respondWith + waitUntil. */
class SwEvent {
  readonly request: FakeRequest;
  response: Promise<FakeResponse | undefined> | undefined;
  pending: Promise<unknown> = Promise.resolve();

  constructor(request?: FakeRequest) {
    this.request = request ?? makeRequest('/');
  }

  respondWith(value: Promise<FakeResponse | undefined> | FakeResponse | undefined): void {
    this.response = Promise.resolve(value);
  }

  waitUntil(value: Promise<unknown>): void {
    this.pending = value;
  }
}

function createHarness() {
  const handlers = new Map<string, (event: SwEvent) => void>();
  const caches = new FakeCaches();
  let fetchImpl: FetchImpl = () => Promise.reject(new Error('fetch не настроен в тесте'));
  // Песочница: параметры self/caches/fetch затеняют глобальные имена внутри
  // тела sw.js, поэтому скрипт исполняется против фейков.
  new Function('self', 'caches', 'fetch', swSource)(
    {
      location: { origin: ORIGIN },
      addEventListener: (type: string, listener: (event: SwEvent) => void) =>
        handlers.set(type, listener),
      skipWaiting: () => undefined,
      clients: { claim: () => undefined },
    },
    caches,
    (request: FakeRequest) => fetchImpl(request),
  );
  return {
    caches,
    setFetch(impl: FetchImpl): void {
      fetchImpl = impl;
    },
    /** undefined → обработчик не перехватил запрос (нет respondWith). */
    async fetchEvent(request: FakeRequest): Promise<FakeResponse | undefined> {
      const event = new SwEvent(request);
      handlers.get('fetch')?.(event);
      return event.response;
    },
    async activate(): Promise<void> {
      const event = new SwEvent();
      handlers.get('activate')?.(event);
      await event.pending;
    },
  };
}

/** Бакет, открытый самим sw.js (имя версии кэша в тестах не хардкодим). */
function onlyBucket(caches: FakeCaches): FakeCache {
  const buckets = [...caches.buckets.values()];
  expect(buckets).toHaveLength(1);
  return buckets[0]!;
}

describe('sw.js — политика кэширования и очистка мусора', () => {
  it('не кэширует SPA-fallback HTML под URL ассета (отравление кэша)', async () => {
    const sw = createHarness();
    sw.setFetch(async () => makeResponse('<!doctype html>', 200, 'text/html; charset=utf-8'));
    const response = await sw.fetchEvent(makeRequest('/assets/index-OLDHASH.js'));
    // Сетевой ответ отдаётся приложению как есть, но в кэш не попадает.
    expect(response?.body).toBe('<!doctype html>');
    expect(onlyBucket(sw.caches).store.has(abs('/assets/index-OLDHASH.js'))).toBe(false);
  });

  it('кэширует успешный ассет и отдаёт его при офлайне', async () => {
    const sw = createHarness();
    sw.setFetch(async () => makeResponse('export {}', 200, 'text/javascript'));
    await sw.fetchEvent(makeRequest('/assets/index-NEW.js'));
    sw.setFetch(() => Promise.reject(new Error('offline')));
    const offline = await sw.fetchEvent(makeRequest('/assets/index-NEW.js'));
    expect(offline?.body).toBe('export {}');
  });

  it('не кэширует не-OK ответы', async () => {
    const sw = createHarness();
    sw.setFetch(async () => makeResponse('Internal Error', 500, 'text/plain'));
    await sw.fetchEvent(makeRequest('/assets/broken.js'));
    expect(onlyBucket(sw.caches).store.size).toBe(0);
  });

  it('навигация: network-first с кэшем, при полном промахе — offline.html', async () => {
    const sw = createHarness();
    sw.setFetch(async () => makeResponse('<html>app</html>', 200, 'text/html'));
    await sw.fetchEvent(makeRequest('/', 'navigate'));
    sw.setFetch(() => Promise.reject(new Error('offline')));
    const cachedNav = await sw.fetchEvent(makeRequest('/', 'navigate'));
    expect(cachedNav?.body).toBe('<html>app</html>');
    await onlyBucket(sw.caches).put('/offline.html', makeResponse('offline', 200, 'text/html'));
    const fallback = await sw.fetchEvent(makeRequest('/unknown-route', 'navigate'));
    expect(fallback?.body).toBe('offline');
  });

  it('хвост /assets/ ограничен MAX_ASSET_ENTRIES, старейший вычищается первым', async () => {
    expect(maxAssetEntries).toBeGreaterThan(0);
    const sw = createHarness();
    sw.setFetch(async () => makeResponse('seed', 200, 'text/javascript'));
    const first = makeRequest('/assets/chunk-0.js');
    await sw.fetchEvent(first);
    const bucket = onlyBucket(sw.caches);
    for (let i = 1; i < maxAssetEntries; i += 1) {
      await bucket.put(
        makeRequest(`/assets/chunk-${i}.js`),
        makeResponse('seed', 200, 'text/javascript'),
      );
    }
    expect(bucket.store.size).toBe(maxAssetEntries);
    sw.setFetch(async () => makeResponse('fresh', 200, 'text/javascript'));
    await sw.fetchEvent(makeRequest('/assets/chunk-new.js'));
    expect(bucket.store.size).toBe(maxAssetEntries);
    expect(bucket.store.has(first.url)).toBe(false);
    expect(bucket.store.has(abs('/assets/chunk-new.js'))).toBe(true);
  });

  it('activate вычищает кэши прежних версий (лечит отравленные v2-кэши в проде)', async () => {
    const sw = createHarness();
    const stale = await sw.caches.open('1trex-sim-v2');
    await stale.put('/assets/poisoned.js', makeResponse('<html>', 200, 'text/html'));
    await sw.activate();
    expect(await sw.caches.keys()).not.toContain('1trex-sim-v2');
  });

  it('не перехватывает не-GET и чужие origin', async () => {
    const sw = createHarness();
    expect(await sw.fetchEvent(makeRequest('/api', 'no-cors', 'POST'))).toBeUndefined();
    expect(await sw.fetchEvent(makeRequest('https://example.com/x.js'))).toBeUndefined();
  });
});

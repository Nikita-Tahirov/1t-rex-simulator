import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFirebaseConfig, resolveAdapterKind } from './firebaseConfig.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getFirebaseConfig', () => {
  it('по умолчанию отдаёт публичный config проекта rex-1t (кросс-девайс из коробки)', () => {
    const cfg = getFirebaseConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.projectId).toBe('rex-1t');
    expect(cfg?.databaseURL).toContain('rex-1t-default-rtdb');
    expect(cfg?.authDomain).toBe('rex-1t.firebaseapp.com');
  });

  it('полный env-override уводит на собственный проект', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'key');
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://custom-default-rtdb.firebasedatabase.app');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'custom');
    const cfg = getFirebaseConfig();
    expect(cfg?.projectId).toBe('custom');
    expect(cfg?.authDomain).toBe('custom.firebaseapp.com');
  });

  it('частичный env (без databaseURL) НЕ ломает дефолт', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'key');
    expect(getFirebaseConfig()?.projectId).toBe('rex-1t');
  });
});

describe('resolveAdapterKind', () => {
  it('по умолчанию firebase (config всегда присутствует)', () => {
    expect(resolveAdapterKind()).toBe('firebase');
  });

  it('VITE_NET_ADAPTER=memory форсирует in-memory (путь e2e/офлайн)', () => {
    vi.stubEnv('VITE_NET_ADAPTER', 'memory');
    expect(resolveAdapterKind()).toBe('memory');
  });

  it('VITE_NET_ADAPTER=firebase форсирует firebase', () => {
    vi.stubEnv('VITE_NET_ADAPTER', 'firebase');
    expect(resolveAdapterKind()).toBe('firebase');
  });
});

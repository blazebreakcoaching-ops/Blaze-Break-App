// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setup = vi.hoisted(() => ({
  db: { testId: 'isolated-db' },
  calls: 0,
  shouldThrow: false,
}));
vi.mock('firebase/app', () => ({ initializeApp: () => ({ name: 'test' }) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  connectAuthEmulator: vi.fn(),
  setPersistence: vi.fn(async () => {}),
  browserLocalPersistence: {}, browserSessionPersistence: {}, inMemoryPersistence: {},
}));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaEnterpriseProvider: class {},
  getToken: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => setup.db,
  connectFirestoreEmulator: () => {
    setup.calls++;
    if (setup.shouldThrow) throw new Error('emulator connection failed');
  },
}));

beforeEach(() => {
  setup.calls = 0;
  setup.shouldThrow = false;
  vi.resetModules();
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_USE_FIREBASE_EMULATOR', 'true');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('Firebase emulator connection isolation', () => {
  it('only connects once for concurrent callers', async () => {
    const { connectFirestoreEmulatorIfNeeded } = await import('./firebase');
    await Promise.all([
      connectFirestoreEmulatorIfNeeded(setup.db as any),
      connectFirestoreEmulatorIfNeeded(setup.db as any),
    ]);
    expect(setup.calls).toBe(1);
  });

  it('does not return a live-targeted database after emulator hookup fails', async () => {
    setup.shouldThrow = true;
    const { getDb } = await import('./firebase');
    const [first, second] = await Promise.allSettled([getDb(), getDb()]);
    expect(first.status).toBe('rejected');
    expect(second.status).toBe('rejected');
    expect(setup.calls).toBe(1); // shared failing attempt
    setup.shouldThrow = false;
    await expect(getDb()).resolves.toBe(setup.db);
    expect(setup.calls).toBe(2); // a later retry is possible
  });

  it('permits a direct reconnect after failure instead of caching false success', async () => {
    const { connectFirestoreEmulatorIfNeeded } = await import('./firebase');
    setup.shouldThrow = true;
    await expect(connectFirestoreEmulatorIfNeeded(setup.db as any)).rejects.toThrow();
    setup.shouldThrow = false;
    await connectFirestoreEmulatorIfNeeded(setup.db as any);
    expect(setup.calls).toBe(2);
  });

  it('does not enable an emulator in a production build even if the flag leaks in', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const { getDb } = await import('./firebase');
    expect(await getDb()).toBe(setup.db);
    expect(setup.calls).toBe(0);
  });
});

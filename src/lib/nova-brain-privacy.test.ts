// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'account-A' } as { uid: string } | null },
  getDocs: vi.fn(),
}));

vi.mock('./firebase', () => ({
  auth: mocks.auth,
  getDb: async () => ({}),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: mocks.getDocs,
}));
vi.mock('../../nova-memory-governance', () => ({
  NOVA_MEMORY_DATA_ZONE: 'personal',
  deriveCanonicalKey: vi.fn(() => 'test-canonical'),
}));

import {
  initNovaBrain, clearNovaBrainCache, getNovaBrain,
  isNovaLearningAllowed, setNovaLearningAllowedForUid,
} from './nova-brain';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const snap = (id: string) => ({
  docs: [{ id, data: () => ({ type: 'profile', content: id, source: 'test' }) }],
});

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'account-A' };
  mocks.getDocs.mockReset();
  localStorage.clear();
  clearNovaBrainCache();
});

describe('Nova local memory cache isolation', () => {
  it('never shows account A memories after account B signs in, even if A finishes last', async () => {
    const readA = deferred<ReturnType<typeof snap>>();
    const readB = deferred<ReturnType<typeof snap>>();
    mocks.getDocs.mockImplementationOnce(() => readA.promise).mockImplementationOnce(() => readB.promise);

    const loadA = initNovaBrain('account-A');
    await vi.waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(1));
    mocks.auth.currentUser = { uid: 'account-B' };
    const loadB = initNovaBrain('account-B');
    await vi.waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(2));
    expect(getNovaBrain()).toEqual([]);

    readB.resolve(snap('B-only'));
    await loadB;
    expect(getNovaBrain().map(m => m.id)).toEqual(['B-only']);

    readA.resolve(snap('A-secret'));
    await loadA;
    expect(getNovaBrain().map(m => m.id)).toEqual(['B-only']);
  });

  it('invalidates an unfinished load when the account signs out', async () => {
    const readA = deferred<ReturnType<typeof snap>>();
    mocks.getDocs.mockImplementationOnce(() => readA.promise);
    const loadA = initNovaBrain('account-A');
    await vi.waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(1));

    mocks.auth.currentUser = null;
    clearNovaBrainCache();
    readA.resolve(snap('A-secret'));
    await loadA;
    expect(getNovaBrain()).toEqual([]);
  });

  it('never imports another account\'s global learning choice, and defaults off', () => {
    localStorage.setItem('blaze_profile', JSON.stringify({ letNovaLearn: true }));
    expect(isNovaLearningAllowed()).toBe(false);
    setNovaLearningAllowedForUid('account-A', true);
    expect(isNovaLearningAllowed()).toBe(true);
    mocks.auth.currentUser = { uid: 'account-B' };
    expect(isNovaLearningAllowed()).toBe(false);
    setNovaLearningAllowedForUid('account-B', false);
    expect(isNovaLearningAllowed()).toBe(false);
  });
});

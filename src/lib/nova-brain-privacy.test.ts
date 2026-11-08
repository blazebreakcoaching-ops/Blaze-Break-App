// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'account-A' } as { uid: string } | null },
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
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
  getDoc: mocks.getDoc,
  doc: vi.fn(() => ({})),
  setDoc: mocks.setDoc,
}));
vi.mock('../../nova-memory-governance', () => ({
  NOVA_MEMORY_DATA_ZONE: 'personal',
  deriveCanonicalKey: vi.fn(() => 'test-canonical'),
}));

import {
  initNovaBrain, clearNovaBrainCache, getNovaBrain, addNovaMemory,
  isNovaLearningAllowed, setNovaLearningAllowedForUid,
  isNovaBrainReadyForAutoSync, updateNovaMemoryBySourceAndType,
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
  mocks.getDoc.mockReset().mockResolvedValue({
    exists: () => true,
    data: () => ({
      allowNovaMemory: true,
      allowNovaUseSavedMemories: true,
    }),
  });
  mocks.setDoc.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
  clearNovaBrainCache();
});

describe('Nova local memory cache isolation', () => {
  it('never shows account A memories after account B signs in, even if A finishes last', async () => {
    setNovaLearningAllowedForUid('account-A', true);
    const readA = deferred<ReturnType<typeof snap>>();
    const readB = deferred<ReturnType<typeof snap>>();
    mocks.getDocs.mockImplementationOnce(() => readA.promise).mockImplementationOnce(() => readB.promise);

    const loadA = initNovaBrain('account-A');
    await vi.waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(1));
    mocks.auth.currentUser = { uid: 'account-B' };
    setNovaLearningAllowedForUid('account-B', true);
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

  it('keeps newly-added same-account memories if Firestore finishes later', async () => {
    setNovaLearningAllowedForUid('account-A', true);
    const pending = deferred<ReturnType<typeof snap>>();
    mocks.getDocs.mockImplementationOnce(() => pending.promise);
    const loading = initNovaBrain('account-A');
    await vi.waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(1));

    setNovaLearningAllowedForUid('account-A', true);
    addNovaMemory({
      type: 'profile', content: 'Newly confirmed preference',
      source: 'test', confidence: 'verified', canEdit: true,
    });
    expect(getNovaBrain().some(m => m.content === 'Newly confirmed preference')).toBe(true);

    pending.resolve(snap('older-memory'));
    await loading;
    expect(getNovaBrain().map(m => m.content)).toContain('Newly confirmed preference');
    expect(getNovaBrain().map(m => m.id)).toContain('older-memory');
  });

  it('invalidates an unfinished load when the account signs out', async () => {
    setNovaLearningAllowedForUid('account-A', true);
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

  it('does not automatically sync when Firestore memory hydration failed', async () => {
    setNovaLearningAllowedForUid('account-A', true);
    mocks.getDocs.mockRejectedValueOnce(new Error('offline'));
    await initNovaBrain('account-A');
    expect(isNovaBrainReadyForAutoSync('account-A')).toBe(false);
  });

  it('only allows automatic profile sync once this UID has hydrated', async () => {
    setNovaLearningAllowedForUid('account-A', true);
    const pending = deferred<ReturnType<typeof snap>>();
    mocks.getDocs.mockImplementationOnce(() => pending.promise);
    const loading = initNovaBrain('account-A');
    await vi.waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(1));
    expect(isNovaBrainReadyForAutoSync('account-A')).toBe(false);
    pending.resolve(snap('A-memory'));
    await loading;
    expect(isNovaBrainReadyForAutoSync('account-A')).toBe(true);
    mocks.auth.currentUser = { uid: 'account-B' };
    expect(isNovaBrainReadyForAutoSync('account-A')).toBe(false);
  });

  it('does not persist a memory again when its canonical values are identical', async () => {
    setNovaLearningAllowedForUid('account-A', true);
    mocks.getDocs.mockResolvedValueOnce({
      docs: [{
        id: 'memory-1',
        data: () => ({
          source: 'User Setup', type: 'profile',
          content: 'Same profile', confidence: 'verified',
          canEdit: true, canonicalKey: 'test-canonical',
        }),
      }],
    });
    await initNovaBrain('account-A');
    setNovaLearningAllowedForUid('account-A', true);
    updateNovaMemoryBySourceAndType('User Setup', 'profile', {
      content: 'Same profile', confidence: 'verified', canEdit: true,
    });
    expect(mocks.setDoc).not.toHaveBeenCalled();
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

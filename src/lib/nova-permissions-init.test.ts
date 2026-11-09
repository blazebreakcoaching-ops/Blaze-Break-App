import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'test-account' } as { uid: string } | null },
  getDb: vi.fn(async () => ({})),
  get: vi.fn(),
  set: vi.fn(),
  runTransaction: vi.fn(),
}));
vi.mock('./firebase', () => ({
  auth: mocks.auth,
  getDb: mocks.getDb,
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...parts: string[]) => parts.join('/')),
  runTransaction: mocks.runTransaction,
}));
vi.mock('../../nova-memory-governance', () => ({
  NOVA_MEMORY_DATA_ZONE: 'personal',
  deriveCanonicalKey: vi.fn(() => 'test'),
}));

import { ensureNovaPermissionsExist } from './nova-brain';

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'test-account' };
  mocks.get.mockReset();
  mocks.set.mockReset();
  mocks.getDb.mockClear();
  mocks.runTransaction.mockReset().mockImplementation(
    async (_db: unknown, callback: (tx: unknown) => Promise<void>) =>
      callback({ get: mocks.get, set: mocks.set }),
  );
});

describe('safe creation of Nova permissions', () => {
  it('creates rules-compatible defaults when there is no permissions record', async () => {
    mocks.get.mockResolvedValue({ exists: () => false });
    await ensureNovaPermissionsExist('test-account', false);
    expect(mocks.runTransaction).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith(
      'users/test-account/nova_permissions/current',
      expect.objectContaining({
        allowCheckins: true, allowEnergyBudgets: true,
        allowNovaMemory: false, allowNovaUseSavedMemories: false,
      }),
    );
  });

  it('never overwrites the existing consent document', async () => {
    mocks.get.mockResolvedValue({ exists: () => true });
    await ensureNovaPermissionsExist('test-account', false);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('retains a truly affirmative choice on the first creation', async () => {
    mocks.get.mockResolvedValue({ exists: () => false });
    await ensureNovaPermissionsExist('test-account', true);
    expect(mocks.set).toHaveBeenCalledWith(
      'users/test-account/nova_permissions/current',
      expect.objectContaining({ allowNovaMemory: true, allowNovaUseSavedMemories: true }),
    );
  });

  it('never creates permissions for an onboarding session that has been replaced', async () => {
    const originalSession = mocks.auth.currentUser;
    mocks.get.mockImplementationOnce(async () => {
      mocks.auth.currentUser = { uid: 'test-account' };
      return { exists: () => false };
    });
    await ensureNovaPermissionsExist('test-account', true);
    expect(mocks.auth.currentUser).not.toBe(originalSession);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  
  it('refuses a permission request for another Firebase account', async () => {
    await ensureNovaPermissionsExist('other-account', true);
    expect(mocks.runTransaction).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('fails closed if Firestore cannot safely initialise permissions', async () => {
    mocks.runTransaction.mockRejectedValueOnce(new Error('offline'));
    await expect(ensureNovaPermissionsExist('test-account', true)).resolves.toBeUndefined();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

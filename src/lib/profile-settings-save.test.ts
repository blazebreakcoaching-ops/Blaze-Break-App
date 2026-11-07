import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'account-A' } as { uid: string } | null },
  getDb: vi.fn(async () => ({})),
  writeBatch: vi.fn(),
  set: vi.fn(),
  commit: vi.fn(),
  doc: vi.fn((_db: unknown, ...paths: string[]) => paths.join('/')),
}));
vi.mock('./firebase', () => ({ auth: mocks.auth, getDb: mocks.getDb }));
vi.mock('firebase/firestore', () => ({
  doc: mocks.doc, writeBatch: mocks.writeBatch,
}));

import { saveVerifiedProfileSettings } from './profile-settings-save';

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'account-A' };
  mocks.set.mockReset();
  mocks.commit.mockReset().mockResolvedValue(undefined);
  mocks.writeBatch.mockReset().mockReturnValue({ set: mocks.set, commit: mocks.commit });
  mocks.doc.mockClear();
  mocks.getDb.mockClear();
});

const profile = {
  fullName: 'Example User', role: '', organization: '', managerEmail: '',
  letNovaLearn: false, questioningStyle: null,
};

describe('verified settings and consent persistence', () => {
  it('commits profile and Nova memory permissions in one atomic batch', async () => {
    await saveVerifiedProfileSettings('account-A', profile);
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(mocks.set).toHaveBeenCalledWith(
      'users/account-A/user_stats/core',
      expect.objectContaining({ profile: expect.objectContaining({
        fullName: 'Example User', letNovaLearn: false, questioningStyle: null,
      }) }),
      { merge: true },
    );
    expect(mocks.set).toHaveBeenCalledWith(
      'users/account-A/nova_permissions/current',
      expect.objectContaining({ allowNovaMemory: false, allowNovaUseSavedMemories: false }),
      { merge: true },
    );
  });

  it('rejects stale account writes without committing', async () => {
    await expect(saveVerifiedProfileSettings('account-B', profile)).rejects.toThrow('Account changed');
    expect(mocks.writeBatch).not.toHaveBeenCalled();
  });

  it('does not report success when Firestore rejects the commit', async () => {
    mocks.commit.mockRejectedValueOnce(new Error('offline'));
    await expect(saveVerifiedProfileSettings('account-A', profile)).rejects.toThrow('offline');
  });

  it('drops explicit undefined profile fields while preserving Off as null', async () => {
    await saveVerifiedProfileSettings('account-A', { ...profile, novaTone: undefined });
    const stored = mocks.set.mock.calls.find(([path]) => path === 'users/account-A/user_stats/core')?.[1]?.profile;
    expect(stored).not.toHaveProperty('novaTone');
    expect(stored).toHaveProperty('questioningStyle', null);
  });
});

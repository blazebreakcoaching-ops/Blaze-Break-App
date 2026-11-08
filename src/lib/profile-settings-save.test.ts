import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'account-A' } as { uid: string } | null },
  getDb: vi.fn(async () => ({})),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
  set: vi.fn(),
  commit: vi.fn(),
  doc: vi.fn((_db: unknown, ...paths: string[]) => paths.join('/')),
}));
vi.mock('./firebase', () => ({ auth: mocks.auth, getDb: mocks.getDb }));
vi.mock('firebase/firestore', () => ({
  doc: mocks.doc, getDoc: mocks.getDoc, writeBatch: mocks.writeBatch,
}));

import { saveVerifiedProfileSettings } from './profile-settings-save';

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'account-A' };
  mocks.set.mockReset();
  mocks.commit.mockReset().mockResolvedValue(undefined);
  mocks.writeBatch.mockReset().mockReturnValue({ set: mocks.set, commit: mocks.commit });
  mocks.doc.mockClear();
  mocks.getDb.mockClear();
  mocks.getDoc.mockReset().mockResolvedValue({ exists: () => true });
});

const profile = {
  fullName: 'Example User', role: '', organization: '', managerEmail: '',
  letNovaLearn: false, questioningStyle: null,
};

describe('verified settings and consent persistence', () => {
  it('commits profile and Nova memory permissions in one atomic batch', async () => {
    await saveVerifiedProfileSettings('account-A', profile);
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledTimes(4);
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

  it('seeds all required permissions only for a brand-new permissions document', async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false });
    await saveVerifiedProfileSettings('account-A', profile);
    const saved = mocks.set.mock.calls.find(([path]) => path === 'users/account-A/nova_permissions/current')?.[1];
    expect(saved).toMatchObject({
      allowCheckins: true, allowEnergyBudgets: true, allowNovaMemory: false,
      allowNovaUseSavedMemories: false,
    });
  });

  it('records onboarding complete only when the same permissions batch commits', async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false });
    await saveVerifiedProfileSettings('account-A', profile, {
      lastSeenChangelogVersion: 'beta-release',
    });
    expect(mocks.commit).toHaveBeenCalledOnce();
    const saved = mocks.set.mock.calls.find(([path]) => path === 'users/account-A/user_stats/core')?.[1];
    expect(saved).toHaveProperty('lastSeenChangelogVersion', 'beta-release');
    expect(mocks.set).toHaveBeenCalledTimes(4);
  });

  it('does not reset an existing account\'s other Nova privacy choices', async () => {
    await saveVerifiedProfileSettings('account-A', profile);
    const saved = mocks.set.mock.calls.find(([path]) => path === 'users/account-A/nova_permissions/current')?.[1];
    expect(Object.keys(saved).sort()).toEqual([
      'allowNovaMemory', 'allowNovaUseSavedMemories', 'updatedAt',
    ].sort());
  });

  it('fails without writing when checking existing privacy permissions fails', async () => {
    mocks.getDoc.mockRejectedValueOnce(new Error('offline'));
    await expect(saveVerifiedProfileSettings('account-A', profile)).rejects.toThrow('offline');
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('does not opt a legacy missing learning choice into memory use', async () => {
    await saveVerifiedProfileSettings('account-A', {
      ...profile, letNovaLearn: undefined,
    });
    const saved = mocks.set.mock.calls.find(([path]) =>
      path === 'users/account-A/nova_permissions/current')?.[1];
    expect(saved.allowNovaMemory).toBe(false);
    expect(saved.allowNovaUseSavedMemories).toBe(false);
  });

  it('allows a deliberately enabled learning choice', async () => {
    await saveVerifiedProfileSettings('account-A', {
      ...profile, letNovaLearn: true,
    });
    const saved = mocks.set.mock.calls.find(([path]) =>
      path === 'users/account-A/nova_permissions/current')?.[1];
    expect(saved.allowNovaMemory).toBe(true);
    expect(saved.allowNovaUseSavedMemories).toBe(true);
  });

  it('drops explicit undefined and client-only entitlement fields', async () => {
    await saveVerifiedProfileSettings('account-A', {
      ...profile, novaTone: undefined, subscription: 'premium' as any,
    });
    const stored = mocks.set.mock.calls.find(([path]) => path === 'users/account-A/user_stats/core')?.[1]?.profile;
    expect(stored).not.toHaveProperty('novaTone');
    expect(stored).not.toHaveProperty('subscription');
    expect(stored).toHaveProperty('questioningStyle', null);
  });

  it('writes welcome preferences to the canonical web + native documents in the same batch', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true });
    await saveVerifiedProfileSettings('account-A', {
      ...profile, preferredName: 'Sam', timeZone: 'Asia/Tokyo', region: 'Japan',
      greetingTone: 'direct', useNameInGreetings: true, greetingEnabled: true,
    } as any);
    expect(mocks.commit).toHaveBeenCalledOnce();
    const root = mocks.set.mock.calls.find(([path]) => path === 'users/account-A')?.[1];
    expect(root).toEqual({ preferredName: 'Sam', timezone: 'Asia/Tokyo', country: 'Japan', locale: 'en', updatedAt: expect.any(String) });
    const ui = mocks.set.mock.calls.find(([path]) => path === 'users/account-A/preferences/ui')?.[1];
    expect(ui).toEqual({ greetingEnabled: true, usePreferredName: true, greetingTone: 'direct', localePreference: 'en', lowEnergyMode: false });
  });

  it('creates the root document with createdAt only when it does not exist yet', async () => {
    mocks.getDoc.mockImplementation(async (ref: string) => ({ exists: () => ref !== 'users/account-A' }));
    await saveVerifiedProfileSettings('account-A', profile);
    const root = mocks.set.mock.calls.find(([path]) => path === 'users/account-A')?.[1];
    expect(root).toHaveProperty('createdAt');
  });

  it('never writes an invalid time zone to the canonical record (falls back to the device zone)', async () => {
    await saveVerifiedProfileSettings('account-A', { ...profile, timeZone: 'Mars/Base' } as any);
    const root = mocks.set.mock.calls.find(([path]) => path === 'users/account-A')?.[1];
    expect(root.timezone).not.toBe('Mars/Base');
    expect(typeof root.timezone).toBe('string');
  });
});

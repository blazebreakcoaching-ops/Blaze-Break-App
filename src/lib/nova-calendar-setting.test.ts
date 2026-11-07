import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'account-A' } as { uid: string } | null },
  getDb: vi.fn(async () => ({})),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('./firebase', () => ({ auth: mocks.auth, getDb: mocks.getDb }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...names: string[]) => names.join('/')),
  runTransaction: mocks.runTransaction,
}));
vi.mock('../../nova-memory-governance', () => ({
  NOVA_MEMORY_DATA_ZONE: 'personal',
  deriveCanonicalKey: vi.fn(() => 'test-canonical'),
}));

import { NOVA_PERMISSION_DEFAULTS, saveCalendarSignalConsent } from './nova-brain';

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'account-A' };
  mocks.get.mockReset();
  mocks.set.mockReset();
  mocks.update.mockReset();
  mocks.runTransaction.mockReset().mockImplementation(async (_db: unknown, cb: (tx: unknown) => Promise<void>) =>
    cb({ get: mocks.get, set: mocks.set, update: mocks.update }));
});

describe('Calendar aggregation needs a separate affirmative choice', () => {
  it('is disabled by default even when onboarding creates the Nova permissions record', () => {
    expect(NOVA_PERMISSION_DEFAULTS.allowCalendarSignals).toBe(false);
  });

  it('creates the full rule-compatible consent document for a deliberate opt-in', async () => {
    mocks.get.mockResolvedValue({ exists: () => false });
    await saveCalendarSignalConsent('account-A', true);
    expect(mocks.set).toHaveBeenCalledWith(
      'users/account-A/nova_permissions/current',
      expect.objectContaining({
        allowCalendarSignals: true,
        calendarSignalsExplicitConsentAt: expect.any(String),
        allowNovaMemory: false, allowNovaUseSavedMemories: false,
        allowCheckins: true,
      }),
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('updates an existing record without resetting the other privacy choices', async () => {
    mocks.get.mockResolvedValue({ exists: () => true });
    await saveCalendarSignalConsent('account-A', false);
    expect(mocks.update).toHaveBeenCalledWith(
      'users/account-A/nova_permissions/current',
      expect.objectContaining({ allowCalendarSignals: false, calendarSignalsExplicitConsentAt: null }),
    );
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('does not write for the previous Firebase account', async () => {
    await expect(saveCalendarSignalConsent('account-B', true)).rejects.toThrow('Account changed');
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it('rejects a mid-request account switch before committing consent', async () => {
    mocks.get.mockImplementationOnce(async () => {
      mocks.auth.currentUser = { uid: 'account-B' };
      return { exists: () => false };
    });
    await expect(saveCalendarSignalConsent('account-A', true)).rejects.toThrow('Account changed');
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

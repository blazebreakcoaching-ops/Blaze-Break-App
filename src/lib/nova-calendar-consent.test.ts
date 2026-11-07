import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'account-A' } as { uid: string } | null },
  getDb: vi.fn(async () => ({})),
  getDoc: vi.fn(),
}));
vi.mock('./firebase', () => ({ auth: mocks.auth, getDb: mocks.getDb }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})), getDoc: mocks.getDoc,
}));
vi.mock('../../nova-memory-governance', () => ({
  NOVA_MEMORY_DATA_ZONE: 'personal', deriveCanonicalKey: vi.fn(() => 'test'),
}));

import { isCalendarSignalConsentGranted } from './nova-brain';
beforeEach(() => {
  mocks.auth.currentUser = { uid: 'account-A' };
  mocks.getDoc.mockReset();
  mocks.getDb.mockClear();
});

describe('Nova Calendar consent must fail closed', () => {
  it('returns false for an account with no permission document', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
  });
  it('returns false if Firestore is unavailable', async () => {
    mocks.getDoc.mockRejectedValue(new Error('offline'));
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
  });
  it('requires a literal saved true with dated opt-in', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ allowCalendarSignals: true }) });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({
      allowCalendarSignals: true, calendarSignalsExplicitConsentAt: new Date().toISOString(),
    }) });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(true);
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ allowCalendarSignals: false }) });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ allowCalendarSignals: 'true' }) });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
  });
  it('rejects a UID that is not the current Firebase account', async () => {
    expect(await isCalendarSignalConsentGranted('account-B')).toBe(false);
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });
  it('rejects consent when the account changes while Firestore is responding', async () => {
    mocks.getDoc.mockImplementationOnce(async () => {
      mocks.auth.currentUser = { uid: 'account-B' };
      return { exists: () => true, data: () => ({
        allowCalendarSignals: true, calendarSignalsExplicitConsentAt: new Date().toISOString(),
      }) };
    });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
  });
  it('rejects consent on sign-out before or after the read', async () => {
    mocks.auth.currentUser = null;
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
    expect(mocks.getDoc).not.toHaveBeenCalled();
    mocks.auth.currentUser = { uid: 'account-A' };
    mocks.getDoc.mockImplementationOnce(async () => {
      mocks.auth.currentUser = null;
      return { exists: () => true, data: () => ({
        allowCalendarSignals: true, calendarSignalsExplicitConsentAt: new Date().toISOString(),
      }) };
    });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
  });
});

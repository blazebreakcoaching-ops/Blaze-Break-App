import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDoc: vi.fn() }));
vi.mock('./firebase', () => ({ auth: { currentUser: null }, getDb: async () => ({}) }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})), getDoc: mocks.getDoc,
}));
vi.mock('../../nova-memory-governance', () => ({
  NOVA_MEMORY_DATA_ZONE: 'personal', deriveCanonicalKey: vi.fn(() => 'test'),
}));

import { isCalendarSignalConsentGranted } from './nova-brain';
beforeEach(() => mocks.getDoc.mockReset());

describe('Nova Calendar consent must fail closed', () => {
  it('returns false for an account with no permission document', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
  });
  it('returns false if Firestore is unavailable', async () => {
    mocks.getDoc.mockRejectedValue(new Error('offline'));
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
  });
  it('requires a literal saved true, not an inferred/default permission', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ allowCalendarSignals: true }) });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(true);
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ allowCalendarSignals: false }) });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ allowCalendarSignals: 'true' }) });
    expect(await isCalendarSignalConsentGranted('account-A')).toBe(false);
  });
});

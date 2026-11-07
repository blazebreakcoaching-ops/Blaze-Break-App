// Nova Calendar Protection - external-action permission boundary (Phase
// 5D, directive §3). Covers the fail-closed default and the
// grant/withdraw round trip, independent of allowCalendarSignals.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCalendarActionPermission, setCalendarActionPermission, CALENDAR_ACTION_PERMISSION_FIELD,
} from './nova-calendar-action-permission';
import { resetStore, fakeDb, getDocRaw } from './test/fake-firestore';

beforeEach(() => resetStore());

const UID = 'user_a';

describe('getCalendarActionPermission - fails closed', () => {
  it('reports not granted when no permissions doc exists at all', async () => {
    const state = await getCalendarActionPermission(fakeDb as any, UID);
    expect(state).toEqual({ granted: false, grantedAt: null, withdrawnAt: null });
  });

  it('reports not granted when the doc exists but the field is missing', async () => {
    await (fakeDb as any).collection(`users/${UID}/nova_permissions`).doc('current').set({ allowCalendarSignals: true });
    const state = await getCalendarActionPermission(fakeDb as any, UID);
    expect(state.granted).toBe(false);
  });

  it('reports not granted for anything other than a literal true', async () => {
    await (fakeDb as any).collection(`users/${UID}/nova_permissions`).doc('current').set({ [CALENDAR_ACTION_PERMISSION_FIELD]: 'yes' });
    const state = await getCalendarActionPermission(fakeDb as any, UID);
    expect(state.granted).toBe(false);
  });
});

describe('setCalendarActionPermission - explicit grant/withdraw with timestamps', () => {
  it('granting sets granted=true with a grantedAt timestamp and clears withdrawnAt', async () => {
    const state = await setCalendarActionPermission(fakeDb as any, UID, true);
    expect(state.granted).toBe(true);
    expect(typeof state.grantedAt).toBe('string');
    expect(state.withdrawnAt).toBeNull();
  });

  it('withdrawing sets granted=false with a withdrawnAt timestamp', async () => {
    await setCalendarActionPermission(fakeDb as any, UID, true);
    const state = await setCalendarActionPermission(fakeDb as any, UID, false);
    expect(state.granted).toBe(false);
    expect(typeof state.withdrawnAt).toBe('string');
  });

  it('does not disturb other fields already on the same nova_permissions document', async () => {
    await (fakeDb as any).collection(`users/${UID}/nova_permissions`).doc('current').set({ allowCalendarSignals: true, allowCheckins: true });
    await setCalendarActionPermission(fakeDb as any, UID, true);
    const raw = getDocRaw(`users/${UID}/nova_permissions/current`);
    expect(raw?.allowCalendarSignals).toBe(true);
    expect(raw?.allowCheckins).toBe(true);
    expect(raw?.[CALENDAR_ACTION_PERMISSION_FIELD]).toBe(true);
  });

  it('is a separate permission from allowCalendarSignals - granting one never implies the other', async () => {
    await (fakeDb as any).collection(`users/${UID}/nova_permissions`).doc('current').set({ allowCalendarSignals: true });
    const state = await getCalendarActionPermission(fakeDb as any, UID);
    expect(state.granted).toBe(false);
  });
});

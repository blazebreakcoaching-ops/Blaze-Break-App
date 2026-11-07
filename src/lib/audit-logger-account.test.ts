// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'account-A' } as { uid: string } | null },
  secureApiFetch: vi.fn(),
}));
vi.mock('./firebase.ts', () => ({ auth: mocks.auth }));
vi.mock('./secure-api.ts', () => ({ secureApiFetch: mocks.secureApiFetch }));

import { getAuditLogs } from './audit-logger';
import { auditStorageKey } from './audit-storage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const entry = (id: string) => ({
  id, userId: id, action: 'Updated profile', status: 'authorised',
  timestamp: '2026-11-07T08:00:00.000Z',
});

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'account-A' };
  mocks.secureApiFetch.mockReset();
  localStorage.clear();
});

describe('audit trail never crosses signed-in accounts', () => {
  it('does not show account A remote records after Firebase switches to B', async () => {
    const response = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    mocks.secureApiFetch.mockImplementationOnce(() => response.promise);
    const originalRequest = getAuditLogs();
    mocks.auth.currentUser = { uid: 'account-B' };
    response.resolve({ ok: true, json: async () => ({ logs: [entry('account-A')] }) });
    expect(await originalRequest).toEqual([]);
  });

  it('uses only B local fallback when remote audit history is offline', async () => {
    localStorage.setItem(auditStorageKey('account-A'), JSON.stringify([entry('account-A')]));
    localStorage.setItem(auditStorageKey('account-B'), JSON.stringify([entry('account-B')]));
    mocks.auth.currentUser = { uid: 'account-B' };
    mocks.secureApiFetch.mockRejectedValueOnce(new Error('offline'));
    const records = await getAuditLogs();
    expect(records.map(record => record.id)).toEqual(['account-B']);
  });

  it('never reads old browser-global audit history', async () => {
    localStorage.setItem('blaze_audit_logs', JSON.stringify([entry('old-account')]));
    mocks.secureApiFetch.mockRejectedValueOnce(new Error('offline'));
    expect(await getAuditLogs()).toEqual([]);
  });

  it('returns no cached audit records while signed out', async () => {
    mocks.auth.currentUser = null;
    expect(await getAuditLogs()).toEqual([]);
    expect(mocks.secureApiFetch).not.toHaveBeenCalled();
  });
});

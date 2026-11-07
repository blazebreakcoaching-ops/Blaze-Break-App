import { describe, expect, it } from 'vitest';
import { auditStorageKey, parseAuditFallback } from './audit-storage';

const valid = {
  id: 'event-1', userId: 'account-A', action: 'Changed consent',
  status: 'authorised', timestamp: '2026-11-07T08:00:00.000Z',
};

describe('local audit fallback privacy', () => {
  it('cannot read the previous account by reusing a browser storage key', () => {
    expect(auditStorageKey('account-A')).not.toBe(auditStorageKey('account-B'));
    expect(auditStorageKey('account A')).not.toBe(auditStorageKey('account%20A'));
  });

  it('rejects malformed records and unknown audit statuses', () => {
    const loaded = parseAuditFallback(JSON.stringify([
      null, 2, {}, { ...valid, status: 'unverified' },
      { ...valid, timestamp: 5 }, valid,
    ]));
    expect(loaded).toEqual([valid]);
  });

  it('returns an empty list when browser storage is damaged or has wrong shape', () => {
    expect(parseAuditFallback(null)).toEqual([]);
    expect(parseAuditFallback('invalid')).toEqual([]);
    expect(parseAuditFallback('{"id":"event"}')).toEqual([]);
  });

  it('keeps a bounded local fallback rather than unlimited customer audit data', () => {
    const data = Array.from({ length: 125 }, (_, index) =>
      ({ ...valid, id: `event-${index}` }));
    const loaded = parseAuditFallback(JSON.stringify(data));
    expect(loaded).toHaveLength(100);
    expect(loaded[0].id).toBe('event-0');
    expect(loaded[99].id).toBe('event-99');
  });
});

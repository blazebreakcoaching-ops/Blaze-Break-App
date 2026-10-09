import { describe, it, expect } from 'vitest';
import { validateProtectedCoreUpsert, buildSeedInvariants, APPROVAL_TIERS, TEST_STATUSES } from './protected-core';

const validEntry = () => ({
  invariantId: 'organisation_privacy_isolation',
  title: 'Organisation Privacy Isolation',
  rule: 'Org staff cannot read private member content.',
  scope: 'Organisation / B2B surfaces',
  owner: null,
  requiredApproval: 'owner_only',
  testStatus: 'machine_tested',
  evidence: 'server.ts:8130',
  allowedChangeProcess: 'Platform Owner review required.',
  lastReviewedAt: null,
  notes: null,
});

describe('validateProtectedCoreUpsert', () => {
  it('accepts a well-formed invariant', () => {
    expect(validateProtectedCoreUpsert(validEntry())).toEqual({ valid: true });
  });

  it('rejects a malformed invariantId', () => {
    expect(validateProtectedCoreUpsert({ ...validEntry(), invariantId: 'Not Snake Case' }).valid).toBe(false);
  });

  it('rejects a missing rule', () => {
    expect(validateProtectedCoreUpsert({ ...validEntry(), rule: '' }).valid).toBe(false);
  });

  it('rejects an invalid requiredApproval', () => {
    expect(validateProtectedCoreUpsert({ ...validEntry(), requiredApproval: 'whoever' }).valid).toBe(false);
  });

  it('rejects an invalid testStatus', () => {
    expect(validateProtectedCoreUpsert({ ...validEntry(), testStatus: 'probably_fine' }).valid).toBe(false);
  });

  it('rejects a missing evidence field - never allow a claim with nothing backing it', () => {
    expect(validateProtectedCoreUpsert({ ...validEntry(), evidence: '' }).valid).toBe(false);
  });

  it('allows null for owner and lastReviewedAt', () => {
    expect(validateProtectedCoreUpsert({ ...validEntry(), owner: null, lastReviewedAt: null }).valid).toBe(true);
  });
});

describe('buildSeedInvariants', () => {
  const seed = buildSeedInvariants('2026-01-01T00:00:00.000Z');

  it('produces a non-empty, fully valid seed set', () => {
    expect(seed.length).toBeGreaterThan(0);
    for (const entry of seed) {
      expect(validateProtectedCoreUpsert(entry)).toEqual({ valid: true });
    }
  });

  it('every seed entry has non-empty, real-looking evidence - never a placeholder', () => {
    for (const entry of seed) {
      expect(entry.evidence.length).toBeGreaterThan(10);
      expect(entry.evidence.toLowerCase()).not.toMatch(/^(tbd|todo|n\/a|none)$/);
    }
  });

  it('every seed entry id is unique', () => {
    const ids = seed.map((e) => e.invariantId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every requiredApproval and testStatus value is drawn from the real enums', () => {
    for (const entry of seed) {
      expect(APPROVAL_TIERS).toContain(entry.requiredApproval);
      expect(TEST_STATUSES).toContain(entry.testStatus);
    }
  });
});

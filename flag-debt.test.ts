import { describe, it, expect } from 'vitest';
import { computeFlagDebt, FlagDebtInput } from './flag-debt';

const NOW = new Date('2026-01-31T00:00:00.000Z');

const entry = (overrides: Partial<FlagDebtInput>): FlagDebtInput => ({
  featureId: 'x', displayName: 'X', lifecycleState: 'draft', enforcementState: 'not_wired',
  createdAt: '2026-01-01T00:00:00.000Z', ...overrides,
});

describe('computeFlagDebt', () => {
  it('includes not_wired and unknown enforcement states', () => {
    const result = computeFlagDebt([entry({ enforcementState: 'not_wired' }), entry({ featureId: 'y', enforcementState: 'unknown' })], NOW);
    expect(result.map((r) => r.featureId).sort()).toEqual(['x', 'y']);
  });

  it('excludes fully_enforced, partially_enforced, frontend_only, backend_only', () => {
    const result = computeFlagDebt([
      entry({ enforcementState: 'fully_enforced' }),
      entry({ featureId: 'y', enforcementState: 'partially_enforced' }),
      entry({ featureId: 'z', enforcementState: 'frontend_only' }),
    ], NOW);
    expect(result).toEqual([]);
  });

  it('excludes removed features even if enforcement is unknown (already retired, not debt)', () => {
    const result = computeFlagDebt([entry({ lifecycleState: 'removed', enforcementState: 'unknown' })], NOW);
    expect(result).toEqual([]);
  });

  it('computes age in days from createdAt', () => {
    const result = computeFlagDebt([entry({ createdAt: '2026-01-01T00:00:00.000Z' })], NOW);
    expect(result[0].ageDays).toBe(30);
  });

  it('sorts oldest first', () => {
    const result = computeFlagDebt([
      entry({ featureId: 'young', createdAt: '2026-01-25T00:00:00.000Z' }),
      entry({ featureId: 'old', createdAt: '2025-12-01T00:00:00.000Z' }),
    ], NOW);
    expect(result.map((r) => r.featureId)).toEqual(['old', 'young']);
  });

  it('gives a different reason for not_wired vs unknown', () => {
    const result = computeFlagDebt([entry({ featureId: 'a', enforcementState: 'not_wired' }), entry({ featureId: 'b', enforcementState: 'unknown' })], NOW);
    expect(result.find((r) => r.featureId === 'a')!.reason).toMatch(/not read anywhere/);
    expect(result.find((r) => r.featureId === 'b')!.reason).toMatch(/never been independently verified/);
  });
});

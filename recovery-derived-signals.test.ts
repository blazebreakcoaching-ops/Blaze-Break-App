import { describe, expect, it } from 'vitest';
import {
  isUsableRecoveryDerivedSummary,
  isHighRisingRecoveryDebt,
  RECOVERY_DERIVED_MAX_AGE_DAYS,
} from './recovery-derived-signals';

const NOW = Date.parse('2026-11-02T12:00:00.000Z');
const age = (days: number) => new Date(NOW - days * 86400000).toISOString();
const debt = (overrides: Record<string, unknown> = {}) => ({
  status: 'available',
  calculatedAt: age(2),
  direction: 'rising',
  value: 80,
  ...overrides,
});

describe('shared recovery-derived summary evidence policy', () => {
  it('accepts an available, recent, non-clinical recovery summary', () => {
    expect(isUsableRecoveryDerivedSummary(debt(), NOW)).toBe(true);
    expect(isHighRisingRecoveryDebt(debt(), NOW)).toBe(true);
    expect(isUsableRecoveryDerivedSummary(debt({ calculatedAt: age(RECOVERY_DERIVED_MAX_AGE_DAYS) }), NOW)).toBe(true);
  });

  it('rejects missing, provisional, expired or future summaries', () => {
    expect(isUsableRecoveryDerivedSummary(null, NOW)).toBe(false);
    expect(isUsableRecoveryDerivedSummary(debt({ status: 'early_signal' }), NOW)).toBe(false);
    expect(isUsableRecoveryDerivedSummary(debt({ status: 'not_enough_data' }), NOW)).toBe(false);
    expect(isUsableRecoveryDerivedSummary(debt({ calculatedAt: age(15) }), NOW)).toBe(false);
    expect(isUsableRecoveryDerivedSummary(debt({ calculatedAt: 'bad' }), NOW)).toBe(false);
    expect(isUsableRecoveryDerivedSummary(debt({ calculatedAt: new Date(NOW + 60000).toISOString() }), NOW)).toBe(false);
  });

  it('requires a finite in-range score and a rising direction for the high-load candidate', () => {
    expect(isHighRisingRecoveryDebt(debt({ value: 65 }), NOW)).toBe(true);
    for (const item of [
      { value: 64 }, { value: 105 }, { value: NaN }, { value: '80' },
      { direction: 'stable' }, { direction: 'falling' }, { value: null },
    ]) {
      expect(isHighRisingRecoveryDebt(debt(item), NOW)).toBe(false);
    }
  });
});

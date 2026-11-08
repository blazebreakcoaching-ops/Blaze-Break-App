import { describe, expect, it } from 'vitest';
import { highestRecordedDebt, recordedDebts, recordedSleepShortfall } from './recorded-debts';
import type { Debt } from '../types';

const debt = (label: string, value: number, max: number, over: Partial<Debt> = {}): Debt =>
  ({ id: label, label, value, max, unit: '', color: '', impact: '', novaNote: '', ...over });
const PLACEHOLDERS = [debt('Sleep Shortfall', 0, 8), debt('Mental Fatigue', 0, 20), debt('Social Load', 0, 10)];

describe('recorded recovery debts (no placeholder is treated as data)', () => {
  it('the zero placeholders every new account starts with count as nothing recorded', () => {
    expect(recordedDebts(PLACEHOLDERS)).toEqual([]);
    expect(highestRecordedDebt(PLACEHOLDERS)).toBeNull();
    expect(recordedSleepShortfall(PLACEHOLDERS)).toBeNull();
    expect(highestRecordedDebt(undefined)).toBeNull();
  });

  it('picks the highest real load relative to its range, ignoring cleared or invalid entries', () => {
    const debts = [debt('Sleep Shortfall', 2, 8), debt('Mental Fatigue', 12, 20), debt('Social Load', 9, 10, { cleared: true }), debt('Bad', Number.NaN, 5)];
    expect(highestRecordedDebt(debts)?.label).toBe('Mental Fatigue');
    expect(recordedSleepShortfall(debts)).toBe(2);
  });
});

import { describe, it, expect } from 'vitest';
import { DEFAULT_COST_RATES, estimateCost, evaluateBudgetAlert } from './cost-estimates';

describe('estimateCost', () => {
  it('zero usage costs zero', () => {
    const result = estimateCost({ novaTextCount: 0, novaVoiceCount: 0, diagnoseCount: 0, smsSegmentCount: 0 });
    expect(result).toEqual({ novaTextUsd: 0, novaVoiceUsd: 0, diagnoseUsd: 0, smsUsd: 0, totalUsd: 0 });
  });

  it('multiplies each usage total by its own rate and sums the total', () => {
    const result = estimateCost(
      { novaTextCount: 100, novaVoiceCount: 10, diagnoseCount: 50, smsSegmentCount: 5 },
      { novaTextPerMessage: 0.01, novaVoicePerSession: 0.2, diagnosePerCall: 0.002, smsPerSegment: 0.05 }
    );
    expect(result.novaTextUsd).toBe(1);
    expect(result.novaVoiceUsd).toBe(2);
    expect(result.diagnoseUsd).toBe(0.1);
    expect(result.smsUsd).toBe(0.25);
    expect(result.totalUsd).toBe(3.35);
  });

  it('uses DEFAULT_COST_RATES when no rates are supplied', () => {
    const result = estimateCost({ novaTextCount: 1000, novaVoiceCount: 0, diagnoseCount: 0, smsSegmentCount: 0 });
    expect(result.novaTextUsd).toBeCloseTo(1000 * DEFAULT_COST_RATES.novaTextPerMessage, 5);
  });
});

describe('evaluateBudgetAlert', () => {
  it('a non-positive budget is treated as "no budget configured" -> ok', () => {
    expect(evaluateBudgetAlert(1000, 0)).toBe('ok');
    expect(evaluateBudgetAlert(1000, -5)).toBe('ok');
  });

  it('crosses each threshold at the right ratio', () => {
    expect(evaluateBudgetAlert(49, 100)).toBe('ok');
    expect(evaluateBudgetAlert(50, 100)).toBe('informational');
    expect(evaluateBudgetAlert(75, 100)).toBe('warning');
    expect(evaluateBudgetAlert(90, 100)).toBe('urgent');
    expect(evaluateBudgetAlert(100, 100)).toBe('protection');
    expect(evaluateBudgetAlert(150, 100)).toBe('protection');
  });
});

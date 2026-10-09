import { describe, it, expect } from 'vitest';
import { buildFinancialRangeEstimate } from './executive-work-design';

const costInputs = { annualSicknessDays: 240, avgDailyCostPerEmployee: 180, headcount: 45 };

describe('buildFinancialRangeEstimate', () => {
  it('returns null when cost inputs are missing', () => {
    expect(buildFinancialRangeEstimate(null, 'Meeting Pressure', 'sustained')).toBeNull();
  });

  it('returns null when band is null (insufficient data)', () => {
    expect(buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', null)).toBeNull();
  });

  it('returns null for a low band - never invents urgency when things look fine', () => {
    expect(buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', 'low')).toBeNull();
  });

  it('returns null for a typical band', () => {
    expect(buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', 'typical')).toBeNull();
  });

  it('returns a real low-high range for an elevated band', () => {
    const result = buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', 'elevated');
    expect(result).not.toBeNull();
    const baseAnnualCost = 240 * 180;
    expect(result!.lowEstimate).toBe(Math.round(baseAnnualCost * 0.05));
    expect(result!.highEstimate).toBe(Math.round(baseAnnualCost * 0.15));
    expect(result!.lowEstimate).toBeLessThan(result!.highEstimate);
  });

  it('returns a real low-high range for a sustained band', () => {
    const result = buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', 'sustained');
    expect(result).not.toBeNull();
  });

  it('the assumption note states the attribution percentage range and never claims a measured effect', () => {
    const result = buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', 'sustained');
    expect(result!.assumptionNote).toMatch(/5-15%/);
    expect(result!.assumptionNote).toMatch(/not a measured effect/);
    expect(result!.assumptionNote).toMatch(/Meeting Pressure/);
  });

  it('returns null when entered cost figures total zero', () => {
    const zeroInputs = { annualSicknessDays: 0, avgDailyCostPerEmployee: 180, headcount: 45 };
    expect(buildFinancialRangeEstimate(zeroInputs, 'Meeting Pressure', 'sustained')).toBeNull();
  });

  it('never returns a single precise figure - low and high are always distinct', () => {
    const result = buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', 'elevated');
    expect(result!.lowEstimate).not.toBe(result!.highEstimate);
  });
});

import { describe, it, expect } from 'vitest';
import { describeTrend, toCustomerInsight, toneFor, CUSTOMER_INSIGHT_TYPES } from './recovery-insights';

const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const fresh = (over: Record<string, unknown> = {}) => ({
  status: 'available', value: 62, direction: 'falling', confidenceLevel: 'medium', sourceCount: 9,
  calculatedAt: '2026-11-06T12:00:00.000Z', explanation: 'Your recovery actions are working and things are stable.', ...over,
});

describe('recovery insights wording is generated from the real result', () => {
  it('never calls a falling trend "stable" or reassuring', () => {
    const text = describeTrend('energy_trend', { status: 'available', direction: 'falling', confidenceLevel: 'medium', sourceCount: 9 });
    expect(text).toMatch(/going down/);
    expect(text).toMatch(/unhelpful direction/);
    expect(text).not.toMatch(/stable|steady|working/i);
  });

  it('rising pressure load is bad news; rising energy and mood are good news', () => {
    expect(toneFor('recovery_debt', 'rising')).toBe('worse');
    expect(toneFor('energy_trend', 'rising')).toBe('better');
    expect(toneFor('mood_trend', 'falling')).toBe('worse');
    expect(toneFor('mood_trend', 'stable')).toBe('steady');
  });

  it('says how much data it is based on and flags low confidence as an early signal', () => {
    const text = describeTrend('mood_trend', { status: 'available', direction: 'rising', confidenceLevel: 'low', sourceCount: 1 });
    expect(text).toContain('1 record from the last 30 days');
    expect(text).toMatch(/early signal/);
    expect(text).toMatch(/not a medical assessment/);
  });

  it('explains insufficient data instead of inventing a trend', () => {
    const text = describeTrend('energy_trend', { status: 'not_enough_data', direction: 'stable', confidenceLevel: 'high', sourceCount: 0 });
    expect(text).toMatch(/^Not enough data yet/);
    expect(text).not.toMatch(/going up|going down|broadly level/);
  });
});

describe('toCustomerInsight', () => {
  it('ignores the stored explanation text and regenerates it', () => {
    const insight = toCustomerInsight('energy_trend', fresh(), NOW);
    expect(insight.explanation).not.toContain('working');
    expect(insight).toMatchObject({ state: 'available', value: 62, direction: 'falling', tone: 'worse' });
  });

  it('hides stale summaries rather than showing out-of-date numbers', () => {
    const insight = toCustomerInsight('mood_trend', fresh({ calculatedAt: '2026-09-01T00:00:00.000Z' }), NOW);
    expect(insight).toMatchObject({ state: 'stale', value: null, tone: 'unknown' });
  });

  it('never returns an out-of-range or non-numeric value', () => {
    expect(toCustomerInsight('energy_trend', fresh({ value: 140 }), NOW).value).toBeNull();
    expect(toCustomerInsight('energy_trend', fresh({ value: '80' }), NOW).value).toBeNull();
  });

  it('reports "not calculated" when no summary exists', () => {
    expect(toCustomerInsight('recovery_debt', null, NOW)).toMatchObject({ state: 'not_calculated', value: null });
  });

  it('excludes the legacy velocity formula from customer insights', () => {
    expect(CUSTOMER_INSIGHT_TYPES).not.toContain('recovery_velocity' as any);
  });
});

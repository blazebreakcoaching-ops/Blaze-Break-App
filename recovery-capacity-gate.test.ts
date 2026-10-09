import { describe, it, expect } from 'vitest';
import { determineBandwidth, isEffortWithinBandwidth, BANDWIDTH_SELF_REPORT_OPTIONS } from './recovery-capacity-gate';

describe('determineBandwidth', () => {
  it('uses an explicit self-report above everything else', () => {
    const result = determineBandwidth({ explicitBandwidthReport: 'reflective_bandwidth', capacityScore: 10 });
    expect(result).toEqual({ band: 'reflective_bandwidth', sufficientData: true, source: 'explicit_self_report' });
  });

  it('is low_bandwidth when capacity score is low', () => {
    expect(determineBandwidth({ capacityScore: 20 })).toEqual({ band: 'low_bandwidth', sufficientData: true, source: 'capacity_check_in' });
  });

  it('is some_bandwidth for a moderate capacity score', () => {
    expect(determineBandwidth({ capacityScore: 55 })).toEqual({ band: 'some_bandwidth', sufficientData: true, source: 'capacity_check_in' });
  });

  it('is reflective_bandwidth for a good capacity score with no strain', () => {
    expect(determineBandwidth({ capacityScore: 85, deltaState: 'buffer_available' })).toEqual({
      band: 'reflective_bandwidth', sufficientData: true, source: 'capacity_check_in',
    });
  });

  it('a severely strained delta state overrides a high capacity score (stale check-in, demand has since moved)', () => {
    expect(determineBandwidth({ capacityScore: 90, deltaState: 'over_capacity' })).toEqual({
      band: 'low_bandwidth', sufficientData: true, source: 'capacity_check_in',
    });
  });

  it('near_limit caps a high capacity score at some_bandwidth, not full reflective', () => {
    expect(determineBandwidth({ capacityScore: 90, deltaState: 'near_limit' })).toEqual({
      band: 'some_bandwidth', sufficientData: true, source: 'capacity_check_in',
    });
  });

  it('an abandoned intervention this session is treated as low_bandwidth even with no capacity score', () => {
    expect(determineBandwidth({ recentInterventionAbandoned: true })).toEqual({
      band: 'low_bandwidth', sufficientData: true, source: 'recent_intervention_signal',
    });
  });

  it('a "not really" reset outcome is treated as low_bandwidth when nothing else is available', () => {
    expect(determineBandwidth({ recentResetOutcome: 'not_really' })).toEqual({
      band: 'low_bandwidth', sufficientData: true, source: 'recent_intervention_signal',
    });
  });

  it('is insufficient_data (never a silent default) when nothing legitimate is available', () => {
    expect(determineBandwidth({})).toEqual({ band: null, sufficientData: false, source: 'insufficient_data' });
  });

  it('missing data is never treated as low capacity', () => {
    const result = determineBandwidth({});
    expect(result.band).not.toBe('low_bandwidth');
    expect(result.sufficientData).toBe(false);
  });
});

describe('isEffortWithinBandwidth', () => {
  it('low effort fits within every band', () => {
    expect(isEffortWithinBandwidth('low_bandwidth', 'low_bandwidth')).toBe(true);
    expect(isEffortWithinBandwidth('low_bandwidth', 'some_bandwidth')).toBe(true);
    expect(isEffortWithinBandwidth('low_bandwidth', 'reflective_bandwidth')).toBe(true);
  });

  it('reflective effort only fits within a reflective band', () => {
    expect(isEffortWithinBandwidth('reflective_bandwidth', 'low_bandwidth')).toBe(false);
    expect(isEffortWithinBandwidth('reflective_bandwidth', 'some_bandwidth')).toBe(false);
    expect(isEffortWithinBandwidth('reflective_bandwidth', 'reflective_bandwidth')).toBe(true);
  });

  it('fails closed (never passes) when the band is null', () => {
    expect(isEffortWithinBandwidth('low_bandwidth', null)).toBe(false);
  });
});

describe('BANDWIDTH_SELF_REPORT_OPTIONS', () => {
  it('has exactly the three options the spec gives verbatim, each mapped to a distinct band', () => {
    expect(BANDWIDTH_SELF_REPORT_OPTIONS.map((o) => o.label)).toEqual(['Almost nothing', 'A quick reset', 'I can think this through']);
    expect(new Set(BANDWIDTH_SELF_REPORT_OPTIONS.map((o) => o.value)).size).toBe(3);
  });
});

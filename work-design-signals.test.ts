import { describe, it, expect } from 'vitest';
import {
  computeMeetingPressureBand, evaluateMeetingPressure, computeConfidence,
  dataAvailable, dataUnavailable, SIGNAL_BAND_ORDER,
} from './work-design-signals';

describe('computeMeetingPressureBand', () => {
  const base = { avgMeetingHoursPerWeek: 10, avgBackToBackMeetingsPerWeek: 2, pctWithEveningMeetings: 5, pctWithWeekendMeetings: 0 };

  it('low: light meeting load with no secondary pressure', () => {
    expect(computeMeetingPressureBand(base).band).toBe('low');
  });

  it('typical: a normal knowledge-work meeting load', () => {
    expect(computeMeetingPressureBand({ ...base, avgMeetingHoursPerWeek: 14 }).band).toBe('typical');
  });

  it('elevated: a heavy but not extreme meeting load', () => {
    expect(computeMeetingPressureBand({ ...base, avgMeetingHoursPerWeek: 20 }).band).toBe('elevated');
  });

  it('sustained: hours alone past the elevated ceiling, regardless of secondary factors', () => {
    expect(computeMeetingPressureBand({ ...base, avgMeetingHoursPerWeek: 30 }).band).toBe('sustained');
  });

  it('a heavy back-to-back pattern nudges a typical load up to elevated', () => {
    const result = computeMeetingPressureBand({ ...base, avgMeetingHoursPerWeek: 14, avgBackToBackMeetingsPerWeek: 9 });
    expect(result.band).toBe('elevated');
  });

  it('high evening-meeting prevalence nudges a low load up to typical', () => {
    const result = computeMeetingPressureBand({ ...base, avgMeetingHoursPerWeek: 8, pctWithEveningMeetings: 45 });
    expect(result.band).toBe('typical');
  });

  it('high weekend-meeting prevalence nudges a low load up to typical', () => {
    const result = computeMeetingPressureBand({ ...base, avgMeetingHoursPerWeek: 8, pctWithWeekendMeetings: 50 });
    expect(result.band).toBe('typical');
  });

  it('a nudge never pushes an already-sustained load any further (it is already the ceiling)', () => {
    const result = computeMeetingPressureBand({ ...base, avgMeetingHoursPerWeek: 30, avgBackToBackMeetingsPerWeek: 20 });
    expect(result.band).toBe('sustained');
    expect(SIGNAL_BAND_ORDER.indexOf(result.band)).toBe(SIGNAL_BAND_ORDER.length - 1);
  });

  it('the basis string names the real contributing figures, never a bare number with no context', () => {
    const result = computeMeetingPressureBand({ ...base, avgMeetingHoursPerWeek: 20, pctWithEveningMeetings: 30 });
    expect(result.basis).toContain('20h');
    expect(result.basis).toContain('30%');
  });
});

describe('evaluateMeetingPressure - no data != zero', () => {
  it('returns a null band with an honest explanation when the cohort snapshot is unavailable', () => {
    const result = evaluateMeetingPressure({ available: false, cohortSize: 2 });
    expect(result.band).toBeNull();
    expect(result.sufficiency.status).toBe('insufficient_data');
    expect(result.sufficiency.message).toBeTruthy();
    expect(result.basis).toBe('');
  });

  it('never returns a numeric-looking zero band when fields are missing despite available:true', () => {
    const result = evaluateMeetingPressure({ available: true, cohortSize: 10 });
    expect(result.band).toBeNull();
    expect(result.sufficiency.status).toBe('insufficient_data');
  });

  it('computes a real band once the snapshot is genuinely available with all fields', () => {
    const result = evaluateMeetingPressure({
      available: true, cohortSize: 12, avgMeetingHoursPerWeek: 10, avgBackToBackMeetingsPerWeek: 1,
      pctWithEveningMeetings: 0, pctWithWeekendMeetings: 0,
    });
    expect(result.band).toBe('low');
    expect(result.sufficiency.status).toBe('available');
    expect(result.basis).toBeTruthy();
  });

  it("'not_connected' when nobody in the candidate pool has connected a calendar at all", () => {
    const result = evaluateMeetingPressure({ available: false, cohortSize: 0, staleCount: 0, threshold: 3 });
    expect(result.sufficiency.status).toBe('not_connected');
  });

  it("'stale' when enough people have connected before but their syncs are too old, and resyncing would clear the threshold", () => {
    const result = evaluateMeetingPressure({ available: false, cohortSize: 1, staleCount: 2, threshold: 3 });
    expect(result.sufficiency.status).toBe('stale');
    expect(result.sufficiency.message).toMatch(/synced/);
  });

  it("falls back to 'insufficient_data' when stale+fresh still wouldn't clear the threshold", () => {
    const result = evaluateMeetingPressure({ available: false, cohortSize: 1, staleCount: 1, threshold: 5 });
    expect(result.sufficiency.status).toBe('insufficient_data');
  });

  it('without staleCount/threshold supplied, behaves exactly as before (backward compatible)', () => {
    const result = evaluateMeetingPressure({ available: false, cohortSize: 2 });
    expect(result.sufficiency.status).toBe('insufficient_data');
  });
});

describe('dataAvailable / dataUnavailable', () => {
  it('dataAvailable carries no message - there is nothing to explain when data is genuinely present', () => {
    expect(dataAvailable()).toEqual({ status: 'available', message: '' });
  });

  it('each unavailable status keeps its own distinct reason, never collapsed into one generic case', () => {
    expect(dataUnavailable('not_connected', 'x').status).toBe('not_connected');
    expect(dataUnavailable('stale', 'y').status).toBe('stale');
    expect(dataUnavailable('demo', 'z').status).toBe('demo');
    expect(dataUnavailable('insufficient_data', 'w').status).toBe('insufficient_data');
  });
});

describe('computeConfidence', () => {
  const full = { cohortSize: 20, cohortThreshold: 5, daysObserved: 30, minDaysForFullConfidence: 28, coveragePercent: 80 };

  it('strong: well above threshold, full window, high coverage', () => {
    expect(computeConfidence(full).level).toBe('strong');
  });

  it('moderate: above threshold and window but coverage/sample not quite at the strong bar', () => {
    expect(computeConfidence({ ...full, cohortSize: 8, coveragePercent: 55 }).level).toBe('moderate');
  });

  it('limited: meets the anonymity threshold but falls short of moderate on window or coverage', () => {
    expect(computeConfidence({ ...full, daysObserved: 5, coveragePercent: 20 }).level).toBe('limited');
  });

  it('insufficient: below the cohort threshold itself, regardless of window/coverage', () => {
    expect(computeConfidence({ ...full, cohortSize: 3, cohortThreshold: 5 }).level).toBe('insufficient');
  });

  it('the explanation names the real cohort size, window and coverage figures', () => {
    const { explanation } = computeConfidence(full);
    expect(explanation).toContain('20');
    expect(explanation).toContain('30');
    expect(explanation).toContain('80%');
  });
});

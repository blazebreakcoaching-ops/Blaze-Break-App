import { describe, it, expect } from 'vitest';
import { buildManagerRecommendation, buildTopManagerRecommendation, ManagerSignalInput } from './nova-manager-coach';

const meetingPressure = (band: ManagerSignalInput['band'], basis = 'Averaging 28h of meetings/week.'): ManagerSignalInput =>
  ({ signalKey: 'meeting_pressure', label: 'Meeting Pressure', band, basis });

describe('buildManagerRecommendation', () => {
  it('returns null for a low band - nothing to recommend when things look fine', () => {
    expect(buildManagerRecommendation(meetingPressure('low'))).toBeNull();
  });

  it('returns null for a typical band', () => {
    expect(buildManagerRecommendation(meetingPressure('typical'))).toBeNull();
  });

  it('returns null when the band is not yet known (insufficient data)', () => {
    expect(buildManagerRecommendation(meetingPressure(null))).toBeNull();
  });

  it('returns a real recommendation for an elevated band, with a distinct primary and alternative action each carrying its own employee burden', () => {
    const rec = buildManagerRecommendation(meetingPressure('elevated'));
    expect(rec).not.toBeNull();
    expect(rec?.signalKey).toBe('meeting_pressure');
    expect(rec?.primaryActionLabel).toBeTruthy();
    expect(rec?.alternativeActionLabel).toBeTruthy();
    expect(rec?.primaryActionLabel).not.toBe(rec?.alternativeActionLabel);
    expect(rec?.primaryActionBurden).toBeTruthy();
    expect(rec?.alternativeActionBurden).toBeTruthy();
  });

  it('returns a distinct, more urgent recommendation for a sustained band', () => {
    const elevated = buildManagerRecommendation(meetingPressure('elevated'));
    const sustained = buildManagerRecommendation(meetingPressure('sustained'));
    expect(sustained?.headline).not.toBe(elevated?.headline);
    expect(sustained?.primaryActionLabel).not.toBe(elevated?.primaryActionLabel);
  });

  it('the "why" is the signal\'s own real basis, never invented text', () => {
    const rec = buildManagerRecommendation(meetingPressure('elevated', 'Averaging 30h of meetings/week, 12 back-to-back/week.'));
    expect(rec?.why).toBe('Averaging 30h of meetings/week, 12 back-to-back/week.');
  });

  it('returns null for a signal this module has no template for yet', () => {
    expect(buildManagerRecommendation({ signalKey: 'focus_fragmentation', label: 'Focus Fragmentation', band: 'elevated', basis: 'x' })).toBeNull();
  });
});

describe('buildTopManagerRecommendation - Decision Compression', () => {
  it('returns null when no signal warrants one', () => {
    expect(buildTopManagerRecommendation([meetingPressure('low'), meetingPressure('typical')])).toBeNull();
  });

  it('returns exactly one recommendation even when multiple signals could independently produce one', () => {
    const signals = [meetingPressure('elevated'), { ...meetingPressure('sustained'), signalKey: 'meeting_pressure_2' } as ManagerSignalInput];
    // Only the templated signal key produces a result; this still proves only ONE comes back, not a list.
    const result = buildTopManagerRecommendation(signals);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
  });

  it('skips a signal with no template and falls through to the next one that has a real recommendation', () => {
    const signals: ManagerSignalInput[] = [
      { signalKey: 'focus_fragmentation', label: 'Focus Fragmentation', band: 'elevated', basis: 'x' },
      meetingPressure('elevated'),
    ];
    const result = buildTopManagerRecommendation(signals);
    expect(result?.signalKey).toBe('meeting_pressure');
  });
});

describe('governance - no diagnostic/clinical language in any manager recommendation', () => {
  const BANNED_TERMS = ['burnout', 'resilien', 'cope', 'mental health', 'diagnos', 'therap', 'disorder', 'anxiety', 'depress'];

  it('every band x the one real signal template is free of banned diagnostic language', () => {
    for (const band of ['elevated', 'sustained'] as const) {
      const rec = buildManagerRecommendation(meetingPressure(band));
      const text = `${rec?.headline} ${rec?.why} ${rec?.primaryActionLabel} ${rec?.alternativeActionLabel}`.toLowerCase();
      for (const term of BANNED_TERMS) {
        expect(text, `band=${band}: "${text}"`).not.toContain(term);
      }
    }
  });

  it('never tells a manager to diagnose or assess an employee - only structural actions', () => {
    for (const band of ['elevated', 'sustained'] as const) {
      const rec = buildManagerRecommendation(meetingPressure(band));
      expect(rec?.primaryActionLabel.toLowerCase()).not.toMatch(/assess|evaluate|screen|identify who/);
    }
  });
});

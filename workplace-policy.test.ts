import { describe, it, expect } from 'vitest';
import {
  isWorkplacePolicyType, validateCreateWorkplacePolicyInput, checkPolicyAgainstObservedPattern,
  WORKPLACE_POLICY_TYPES,
} from './workplace-policy';

describe('isWorkplacePolicyType', () => {
  it('accepts every real policy type', () => {
    for (const t of WORKPLACE_POLICY_TYPES) expect(isWorkplacePolicyType(t)).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(isWorkplacePolicyType('no_friday_meetings')).toBe(false);
    expect(isWorkplacePolicyType(42)).toBe(false);
  });
});

describe('validateCreateWorkplacePolicyInput', () => {
  it('accepts a well-formed no_evening_meetings policy', () => {
    expect(validateCreateWorkplacePolicyInput({ type: 'no_evening_meetings', label: 'No meetings after 6pm' })).toEqual({ valid: true });
  });

  it('accepts a well-formed max_meeting_hours_per_week policy with a threshold', () => {
    expect(validateCreateWorkplacePolicyInput({ type: 'max_meeting_hours_per_week', label: 'Cap at 15h/week', thresholdHours: 15 }).valid).toBe(true);
  });

  it('rejects max_meeting_hours_per_week with no threshold', () => {
    expect(validateCreateWorkplacePolicyInput({ type: 'max_meeting_hours_per_week', label: 'Cap at 15h/week' }).valid).toBe(false);
  });

  it('rejects an out-of-range threshold', () => {
    expect(validateCreateWorkplacePolicyInput({ type: 'max_meeting_hours_per_week', label: 'x', thresholdHours: 0 }).valid).toBe(false);
    expect(validateCreateWorkplacePolicyInput({ type: 'max_meeting_hours_per_week', label: 'x', thresholdHours: 200 }).valid).toBe(false);
  });

  it('rejects a missing label', () => {
    expect(validateCreateWorkplacePolicyInput({ type: 'no_evening_meetings', label: '' }).valid).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(validateCreateWorkplacePolicyInput({ type: 'no_friday_meetings', label: 'x' }).valid).toBe(false);
  });

  it('rejects a non-object input', () => {
    expect(validateCreateWorkplacePolicyInput('nope').valid).toBe(false);
    expect(validateCreateWorkplacePolicyInput(null).valid).toBe(false);
  });
});

describe('checkPolicyAgainstObservedPattern', () => {
  const observed = { avgMeetingHoursPerWeek: 10, pctWithEveningMeetings: 2, pctWithWeekendMeetings: 0 };

  it('returns null when a no_evening_meetings policy is actually being followed', () => {
    expect(checkPolicyAgainstObservedPattern({ type: 'no_evening_meetings', label: 'No evenings' }, observed)).toBeNull();
  });

  it('flags a gap when evening meetings exceed tolerance', () => {
    const finding = checkPolicyAgainstObservedPattern({ type: 'no_evening_meetings', label: 'No evenings' }, { ...observed, pctWithEveningMeetings: 30 });
    expect(finding).not.toBeNull();
    expect(finding?.message).toContain('30%');
  });

  it('flags a gap when weekend meetings exceed tolerance', () => {
    const finding = checkPolicyAgainstObservedPattern({ type: 'no_weekend_meetings', label: 'No weekends' }, { ...observed, pctWithWeekendMeetings: 20 });
    expect(finding).not.toBeNull();
    expect(finding?.message).toContain('20%');
  });

  it('returns null when a no_weekend_meetings policy is actually being followed', () => {
    expect(checkPolicyAgainstObservedPattern({ type: 'no_weekend_meetings', label: 'No weekends' }, observed)).toBeNull();
  });

  it('flags a gap when average meeting hours exceed the declared cap', () => {
    const finding = checkPolicyAgainstObservedPattern({ type: 'max_meeting_hours_per_week', label: 'Cap at 8h', thresholdHours: 8 }, observed);
    expect(finding).not.toBeNull();
    expect(finding?.message).toContain('8h/week');
    expect(finding?.message).toContain('10h/week');
  });

  it('returns null when average meeting hours are within the declared cap', () => {
    expect(checkPolicyAgainstObservedPattern({ type: 'max_meeting_hours_per_week', label: 'Cap at 20h', thresholdHours: 20 }, observed)).toBeNull();
  });

  it('tolerates a small, noise-level share rather than flagging every nonzero percentage', () => {
    expect(checkPolicyAgainstObservedPattern({ type: 'no_evening_meetings', label: 'No evenings' }, { ...observed, pctWithEveningMeetings: 5 })).toBeNull();
  });
});

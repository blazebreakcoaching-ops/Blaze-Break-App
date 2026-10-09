import { describe, it, expect } from 'vitest';
import {
  isInterventionStatus, isOutcomeRating, validateCreateInterventionInput,
  validateStatusUpdateInput, validateRecordOutcomeInput, INTERVENTION_STATUSES, OUTCOME_RATINGS,
} from './work-design-interventions';

describe('isInterventionStatus', () => {
  it('accepts every spec-named status', () => {
    for (const s of INTERVENTION_STATUSES) expect(isInterventionStatus(s)).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(isInterventionStatus('in_progress')).toBe(false);
    expect(isInterventionStatus(42)).toBe(false);
  });
});

describe('isOutcomeRating', () => {
  it('accepts every spec-named rating', () => {
    for (const r of OUTCOME_RATINGS) expect(isOutcomeRating(r)).toBe(true);
  });

  it('rejects an unknown rating', () => {
    expect(isOutcomeRating('amazing')).toBe(false);
  });
});

describe('validateCreateInterventionInput', () => {
  const valid = { team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'Basis text' };

  it('accepts a well-formed input', () => {
    expect(validateCreateInterventionInput(valid)).toEqual({ valid: true });
  });

  it('accepts an optional reviewInDays within range', () => {
    expect(validateCreateInterventionInput({ ...valid, reviewInDays: 21 }).valid).toBe(true);
  });

  it('rejects a missing team', () => {
    const { team, ...rest } = valid;
    expect(validateCreateInterventionInput(rest).valid).toBe(false);
  });

  it('rejects an empty proposedChange', () => {
    expect(validateCreateInterventionInput({ ...valid, proposedChange: '' }).valid).toBe(false);
  });

  it('rejects a reviewInDays out of range', () => {
    expect(validateCreateInterventionInput({ ...valid, reviewInDays: 0 }).valid).toBe(false);
    expect(validateCreateInterventionInput({ ...valid, reviewInDays: 400 }).valid).toBe(false);
  });

  it('rejects a non-object input', () => {
    expect(validateCreateInterventionInput('nope').valid).toBe(false);
    expect(validateCreateInterventionInput(null).valid).toBe(false);
  });
});

describe('validateStatusUpdateInput', () => {
  it('accepts a known status', () => {
    expect(validateStatusUpdateInput({ status: 'trialling' })).toEqual({ valid: true });
  });

  it('rejects an unknown status', () => {
    expect(validateStatusUpdateInput({ status: 'paused' }).valid).toBe(false);
  });

  it('rejects a missing status', () => {
    expect(validateStatusUpdateInput({}).valid).toBe(false);
  });
});

describe('validateRecordOutcomeInput', () => {
  it('accepts a rating alone', () => {
    expect(validateRecordOutcomeInput({ outcomeRating: 'useful' })).toEqual({ valid: true });
  });

  it('accepts a rating with notes', () => {
    expect(validateRecordOutcomeInput({ outcomeRating: 'partly_useful', outcomeNotes: 'Mixed results' }).valid).toBe(true);
  });

  it('rejects an invalid rating', () => {
    expect(validateRecordOutcomeInput({ outcomeRating: 'great' }).valid).toBe(false);
  });

  it('rejects an overlong note', () => {
    expect(validateRecordOutcomeInput({ outcomeRating: 'useful', outcomeNotes: 'x'.repeat(1001) }).valid).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { deriveSuggestionResponse } from './suggestion-response';

describe('deriveSuggestionResponse', () => {
  it('returns null when nothing has been reviewed at all', () => {
    expect(deriveSuggestionResponse({ linkedInterventionId: null, interventionStatus: null, outcomeRating: null, note: null })).toBeNull();
  });

  it('returns not_yet when an admin left an honest note with no linked intervention', () => {
    const result = deriveSuggestionResponse({ linkedInterventionId: null, interventionStatus: null, outcomeRating: null, note: "We haven't changed this yet." });
    expect(result).toEqual({ type: 'not_yet', message: "We haven't changed this yet." });
  });

  it('returns in_progress when linked to a trial with no outcome recorded yet', () => {
    const result = deriveSuggestionResponse({ linkedInterventionId: 'i1', interventionStatus: 'trialling', outcomeRating: null, note: null });
    expect(result?.type).toBe('in_progress');
  });

  it('returns changed when the linked intervention outcome was useful', () => {
    const result = deriveSuggestionResponse({ linkedInterventionId: 'i1', interventionStatus: 'completed', outcomeRating: 'useful', note: null });
    expect(result?.type).toBe('changed');
  });

  it('returns changed when the linked intervention outcome was partly_useful', () => {
    const result = deriveSuggestionResponse({ linkedInterventionId: 'i1', interventionStatus: 'completed', outcomeRating: 'partly_useful', note: null });
    expect(result?.type).toBe('changed');
  });

  it('returns tried_no_clear_benefit when the linked intervention outcome was no_clear_difference', () => {
    const result = deriveSuggestionResponse({ linkedInterventionId: 'i1', interventionStatus: 'completed', outcomeRating: 'no_clear_difference', note: null });
    expect(result?.type).toBe('tried_no_clear_benefit');
  });

  it('returns tried_no_clear_benefit when the linked intervention outcome was created_another_problem', () => {
    const result = deriveSuggestionResponse({ linkedInterventionId: 'i1', interventionStatus: 'completed', outcomeRating: 'created_another_problem', note: null });
    expect(result?.type).toBe('tried_no_clear_benefit');
  });

  it('never claims "changed" without a real positive outcome recorded', () => {
    const result = deriveSuggestionResponse({ linkedInterventionId: 'i1', interventionStatus: 'stopped', outcomeRating: 'stopped_early', note: null });
    expect(result?.type).not.toBe('changed');
  });
});

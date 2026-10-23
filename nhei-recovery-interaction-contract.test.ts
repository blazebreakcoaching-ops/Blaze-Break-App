import { describe, it, expect } from 'vitest';
import {
  initNheiRecoveryInteractionState,
  applyNheiRecoveryInteraction,
  type NheiRecoveryInteractionState,
} from './nhei-recovery-interaction-contract';

const arbitration = {
  selected: { suggestionId: 'reset_studio_1' },
  alternatives: [{ suggestionId: 'my_patterns_1' }, { suggestionId: 'anxiety_reset_1' }],
};

describe('initNheiRecoveryInteractionState', () => {
  it('starts with the arbitration default selected and both alternatives known', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    expect(state.selectedSuggestionId).toBe('reset_studio_1');
    expect(state.availableSuggestionIds.sort()).toEqual(['anxiety_reset_1', 'my_patterns_1', 'reset_studio_1'].sort());
    expect(state.declinedAll).toBe(false);
  });

  it('handles a null selected (abstention) cleanly', () => {
    const state = initNheiRecoveryInteractionState({ selected: null, alternatives: [{ suggestionId: 'a' }] });
    expect(state.selectedSuggestionId).toBeNull();
    expect(state.availableSuggestionIds).toEqual(['a']);
  });
});

describe('applyNheiRecoveryInteraction - accept', () => {
  it('switches selection to an accepted alternative', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'accept', suggestionId: 'my_patterns_1' });
    expect(next.selectedSuggestionId).toBe('my_patterns_1');
  });

  it('rejects (no-op, flagged) an accept for an unknown suggestion id', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'accept', suggestionId: 'does_not_exist' });
    expect(next.selectedSuggestionId).toBe('reset_studio_1'); // unchanged
    expect(next.lastActionRejectedReason).toBe('unknown_suggestion_id');
  });
});

describe('applyNheiRecoveryInteraction - dismiss', () => {
  it('clears selection when the currently-selected suggestion is dismissed', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'dismiss', suggestionId: 'reset_studio_1' });
    expect(next.selectedSuggestionId).toBeNull();
    expect(next.dismissedSuggestionIds).toContain('reset_studio_1');
  });

  it('dismissing a non-selected alternative leaves the current selection untouched', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'dismiss', suggestionId: 'my_patterns_1' });
    expect(next.selectedSuggestionId).toBe('reset_studio_1');
    expect(next.dismissedSuggestionIds).toEqual(['my_patterns_1']);
  });

  it('dismissing the same suggestion twice does not duplicate it in dismissedSuggestionIds', () => {
    let state = initNheiRecoveryInteractionState(arbitration);
    state = applyNheiRecoveryInteraction(state, { type: 'dismiss', suggestionId: 'my_patterns_1' });
    state = applyNheiRecoveryInteraction(state, { type: 'dismiss', suggestionId: 'my_patterns_1' });
    expect(state.dismissedSuggestionIds).toEqual(['my_patterns_1']);
  });

  it('a dismissal never carries a resistance score, penalty, or trait field of any kind', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'dismiss', suggestionId: 'reset_studio_1' });
    expect(next).not.toHaveProperty('resistanceScore');
    expect(next).not.toHaveProperty('noncomplianceCount');
    expect(next).not.toHaveProperty('trait');
  });
});

describe('applyNheiRecoveryInteraction - explain', () => {
  it('records that an explanation was requested without changing the selection', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'explain', suggestionId: 'reset_studio_1' });
    expect(next.explainedSuggestionIds).toContain('reset_studio_1');
    expect(next.selectedSuggestionId).toBe('reset_studio_1');
  });
});

describe('applyNheiRecoveryInteraction - view_alternative', () => {
  it('records which alternative is being viewed without changing the selection', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'view_alternative', suggestionId: 'anxiety_reset_1' });
    expect(next.viewedAlternativeId).toBe('anxiety_reset_1');
    expect(next.selectedSuggestionId).toBe('reset_studio_1'); // still the original
  });
});

describe('applyNheiRecoveryInteraction - correct_interpretation', () => {
  it('records a correction by id only - the optional note is never stored as raw content anywhere in state', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'correct_interpretation', suggestionId: 'reset_studio_1', note: 'this is not about guilt at all' });
    expect(next.correctedSuggestionIds).toContain('reset_studio_1');
    // The note itself appears nowhere in the returned state object.
    expect(JSON.stringify(next)).not.toContain('guilt');
  });

  it('does not change the current selection', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'correct_interpretation', suggestionId: 'reset_studio_1' });
    expect(next.selectedSuggestionId).toBe('reset_studio_1');
  });
});

describe('applyNheiRecoveryInteraction - decline_all', () => {
  it('clears the selection and sets declinedAll, with no suggestion-specific penalty', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const next = applyNheiRecoveryInteraction(state, { type: 'decline_all' });
    expect(next.declinedAll).toBe(true);
    expect(next.selectedSuggestionId).toBeNull();
    expect(next.dismissedSuggestionIds).toEqual([]); // decline_all is not the same as dismissing each one
  });
});

describe('applyNheiRecoveryInteraction - no side effects of any kind', () => {
  it('the reducer never mutates its input state object', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const frozen: NheiRecoveryInteractionState = { ...state };
    applyNheiRecoveryInteraction(state, { type: 'dismiss', suggestionId: 'reset_studio_1' });
    expect(state).toEqual(frozen);
  });

  it('is deterministic - the same (state, action) pair always produces an equal result', () => {
    const state = initNheiRecoveryInteractionState(arbitration);
    const a = applyNheiRecoveryInteraction(state, { type: 'explain', suggestionId: 'my_patterns_1' });
    const b = applyNheiRecoveryInteraction(state, { type: 'explain', suggestionId: 'my_patterns_1' });
    expect(a).toEqual(b);
  });
});

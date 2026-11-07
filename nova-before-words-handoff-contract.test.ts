import { describe, it, expect } from 'vitest';
import { buildNovaIntakeSummaryFromBeforeWords } from './nova-before-words-handoff-contract';
import {
  initNheiBeforeWordsState, beginFreeExpression, setFreeExpressionText, moveToOptionalPrompts,
  answerPrompt, moveToReview, addCorrection, decideProceedWithoutRetaining, decideRetainAsReflectionEvidence,
} from './nhei-before-words-contract';

describe('buildNovaIntakeSummaryFromBeforeWords', () => {
  it('returns null when the user chose to proceed without retaining - never reconstructs a summary from discarded input', () => {
    let state = initNheiBeforeWordsState();
    state = beginFreeExpression(state);
    state = setFreeExpressionText(state, 'Something I don\'t want kept anywhere.');
    state = decideProceedWithoutRetaining(state);
    expect(buildNovaIntakeSummaryFromBeforeWords(state)).toBeNull();
  });

  it('returns null for a state that never reached a decision at all', () => {
    const state = initNheiBeforeWordsState();
    expect(buildNovaIntakeSummaryFromBeforeWords(state)).toBeNull();
  });

  it('carries the user\'s own text and uncertainty flags verbatim when retain was explicitly chosen', () => {
    let state = initNheiBeforeWordsState();
    state = beginFreeExpression(state);
    state = setFreeExpressionText(state, 'It has been a lot lately.');
    state = moveToOptionalPrompts(state);
    state = answerPrompt(state, 'how_my_body_feels', 'Tight chest', true);
    state = moveToReview(state);
    state = addCorrection(state, 'Actually it started a week earlier than I said.');
    state = decideRetainAsReflectionEvidence(state);

    const summary = buildNovaIntakeSummaryFromBeforeWords(state);
    expect(summary).not.toBeNull();
    expect(summary!.freeExpressionText).toBe('It has been a lot lately.');
    expect(summary!.promptResponses).toEqual([{ category: 'how_my_body_feels', text: 'Tight chest', uncertain: true }]);
    expect(summary!.corrections).toEqual(['Actually it started a week earlier than I said.']);
    expect(summary!.hasUncertainty).toBe(true);
  });

  it('hasUncertainty is false when every answered prompt was marked certain', () => {
    let state = initNheiBeforeWordsState();
    state = beginFreeExpression(state);
    state = moveToOptionalPrompts(state);
    state = answerPrompt(state, 'what_happened', 'A meeting ran long.', false);
    state = decideRetainAsReflectionEvidence(state);
    expect(buildNovaIntakeSummaryFromBeforeWords(state)!.hasUncertainty).toBe(false);
  });

  it('adds no field beyond a direct carry-over - no diagnosis/trait/interpretation key exists on the result', () => {
    let state = initNheiBeforeWordsState();
    state = beginFreeExpression(state);
    state = decideRetainAsReflectionEvidence(state);
    const summary = buildNovaIntakeSummaryFromBeforeWords(state)!;
    expect(Object.keys(summary).sort()).toEqual(['corrections', 'freeExpressionText', 'hasUncertainty', 'promptResponses']);
  });
});

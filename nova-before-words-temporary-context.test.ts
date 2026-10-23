// Before Words -> temporary Nova context (Phase 5D, directive §6).

import { describe, it, expect } from 'vitest';
import { buildTemporaryNovaContextFromBeforeWords } from './nova-before-words-temporary-context';
import {
  initNheiBeforeWordsState, setFreeExpressionText, decideProceedWithoutRetaining, decideRetainAsReflectionEvidence,
  answerPrompt, addCorrection,
} from './nhei-before-words-contract';

describe('buildTemporaryNovaContextFromBeforeWords', () => {
  it('returns null before any decision has been reached', () => {
    const state = setFreeExpressionText(initNheiBeforeWordsState(), 'Something happened today.');
    expect(buildTemporaryNovaContextFromBeforeWords(state)).toBeNull();
  });

  it('returns null for an empty session even after a decision, since there is nothing to hand off', () => {
    const state = decideProceedWithoutRetaining(initNheiBeforeWordsState());
    expect(buildTemporaryNovaContextFromBeforeWords(state)).toBeNull();
  });

  it('builds a temporary context for proceed_without_retaining - the ending that previously got no handoff at all', () => {
    let state = setFreeExpressionText(initNheiBeforeWordsState(), 'Work has been relentless.');
    state = decideProceedWithoutRetaining(state);
    const context = buildTemporaryNovaContextFromBeforeWords(state);
    expect(context).not.toBeNull();
    expect(context?.freeExpressionText).toBe('Work has been relentless.');
    expect(context?.persisted).toBe(false);
    expect(context?.kind).toBe('temporary_before_words_context');
  });

  it('builds the same shape for retain_as_reflection_evidence - this context is independent of the retain decision', () => {
    let state = setFreeExpressionText(initNheiBeforeWordsState(), 'I need a break.');
    state = decideRetainAsReflectionEvidence(state);
    const context = buildTemporaryNovaContextFromBeforeWords(state);
    expect(context).not.toBeNull();
    expect(context?.freeExpressionText).toBe('I need a break.');
    expect(context?.persisted).toBe(false);
  });

  it('carries over prompt responses, uncertainty, and corrections exactly as stated - no interpretation added', () => {
    let state = initNheiBeforeWordsState();
    state = answerPrompt(state, 'what_happened', 'A hard meeting.', true);
    state = addCorrection(state, 'Actually it was two meetings.');
    state = decideProceedWithoutRetaining(state);
    const context = buildTemporaryNovaContextFromBeforeWords(state);
    expect(context?.promptResponses).toEqual([{ category: 'what_happened', text: 'A hard meeting.', uncertain: true }]);
    expect(context?.corrections).toEqual(['Actually it was two meetings.']);
    expect(context?.hasUncertainty).toBe(true);
  });

  it('is never confused with a NovaIntakeSummary - the kind tag and persisted flag are both present and literal', () => {
    let state = setFreeExpressionText(initNheiBeforeWordsState(), 'x');
    state = decideProceedWithoutRetaining(state);
    const context = buildTemporaryNovaContextFromBeforeWords(state);
    expect(context).toEqual(expect.objectContaining({ kind: 'temporary_before_words_context', persisted: false }));
  });
});

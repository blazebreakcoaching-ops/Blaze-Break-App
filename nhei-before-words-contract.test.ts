import { describe, it, expect } from 'vitest';
import {
  initNheiBeforeWordsState, beginFreeExpression, setFreeExpressionText, moveToOptionalPrompts,
  answerPrompt, skipPrompt, moveToReview, addCorrection, decideProceedWithoutRetaining,
  decideRetainAsReflectionEvidence, hasAnyContent,
} from './nhei-before-words-contract';

describe('Before Words - free expression and optional prompts', () => {
  it('starts at intro with no content', () => {
    const state = initNheiBeforeWordsState();
    expect(state.step).toBe('intro');
    expect(hasAnyContent(state)).toBe(false);
  });

  it('free text is never forced into a label', () => {
    let state = initNheiBeforeWordsState();
    state = beginFreeExpression(state);
    state = setFreeExpressionText(state, 'I don’t really know how to describe it.');
    expect(state.freeExpressionText).toBe('I don’t really know how to describe it.');
    expect(hasAnyContent(state)).toBe(true);
  });

  it('every prompt can be skipped, and skipping never fabricates an answer', () => {
    let state = initNheiBeforeWordsState();
    state = moveToOptionalPrompts(state);
    state = skipPrompt(state, 'how_my_body_feels');
    expect(state.skippedPromptCategories).toContain('how_my_body_feels');
    expect(state.promptResponses.find((r) => r.category === 'how_my_body_feels')).toBeUndefined();
  });

  it('a prompt response can be marked uncertain by the user themselves', () => {
    let state = initNheiBeforeWordsState();
    state = answerPrompt(state, 'what_im_thinking', 'maybe something about work? not sure.', true);
    expect(state.promptResponses[0].uncertain).toBe(true);
  });

  it('answering the same prompt twice replaces the earlier answer rather than duplicating it', () => {
    let state = initNheiBeforeWordsState();
    state = answerPrompt(state, 'what_happened', 'first draft', false);
    state = answerPrompt(state, 'what_happened', 'revised', false);
    expect(state.promptResponses).toHaveLength(1);
    expect(state.promptResponses[0].text).toBe('revised');
  });
});

describe('Before Words - correcting Nova', () => {
  it('a correction is additive - the original text is never overwritten or deleted', () => {
    let state = initNheiBeforeWordsState();
    state = setFreeExpressionText(state, 'original description');
    state = moveToReview(state);
    state = addCorrection(state, 'actually it was more about my manager than my workload');
    expect(state.freeExpressionText).toBe('original description');
    expect(state.corrections).toContain('actually it was more about my manager than my workload');
  });
});

describe('Before Words - proceeding without retaining is a real, equal outcome', () => {
  it('decideProceedWithoutRetaining reaches a decided state with no retention', () => {
    let state = initNheiBeforeWordsState();
    state = setFreeExpressionText(state, 'something happened today');
    state = decideProceedWithoutRetaining(state);
    expect(state.step).toBe('decided');
    expect(state.decision).toBe('proceed_without_retaining');
  });

  it('this module performs no persistence of any kind - it has zero import statements at all', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(new URL('./nhei-before-words-contract.ts', import.meta.url), 'utf-8');
    const importLines = content.split('\n').filter((l) => l.trim().startsWith('import'));
    expect(importLines).toHaveLength(0);
  });

  it('decideRetainAsReflectionEvidence only records the user’s decision - it does not itself write anything anywhere', () => {
    let state = initNheiBeforeWordsState();
    state = decideRetainAsReflectionEvidence(state);
    expect(state.decision).toBe('retain_as_reflection_evidence');
    // No evidence-write function exists in this module to call - a real
    // caller would need its own separate, explicit write, which this
    // file structurally cannot perform.
  });
});

describe('Before Words - no clinical claim', () => {
  it('a fresh or fully-answered state never carries a score, trait, or confidence field - only the fields this test already exercises', () => {
    let state = initNheiBeforeWordsState();
    state = setFreeExpressionText(state, 'free text only');
    state = answerPrompt(state, 'how_my_body_feels', 'tense shoulders', false);
    const knownKeys = ['step', 'freeExpressionText', 'promptResponses', 'skippedPromptCategories', 'corrections', 'decision'];
    expect(Object.keys(state).sort()).toEqual([...knownKeys].sort());
  });
});

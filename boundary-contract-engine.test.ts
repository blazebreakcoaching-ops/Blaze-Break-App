import { describe, it, expect } from 'vitest';
import {
  BOUNDARY_CONTRACT_CATEGORY_ORDER, BOUNDARY_CONTRACT_CATEGORY_LABELS, BOUNDARY_CONTRACT_CATEGORY_PROMPTS,
  CONTRACT_REVIEW_CHOICE_ORDER, CONTRACT_REVIEW_CHOICE_LABELS, CONTRACT_REVIEW_QUESTION,
  applyContractReview, suggestsContractNeedsRevisiting, ContractReviewEntry, NEEDS_REVISITING_LINE,
} from './boundary-contract-engine';

describe('Boundary Contract categories: every category has a label and a prompt', () => {
  it('covers all six categories', () => {
    expect(BOUNDARY_CONTRACT_CATEGORY_ORDER).toHaveLength(6);
    BOUNDARY_CONTRACT_CATEGORY_ORDER.forEach((c) => {
      expect(BOUNDARY_CONTRACT_CATEGORY_LABELS[c]).toBeTruthy();
      expect(BOUNDARY_CONTRACT_CATEGORY_PROMPTS[c]).toBeTruthy();
    });
  });
});

describe('Contract review: Keep / Make Exception / Change, never auto-enforced', () => {
  it('has the exact question and three choices', () => {
    expect(CONTRACT_REVIEW_QUESTION).toBe('This boundary got tested. What now?');
    expect(CONTRACT_REVIEW_CHOICE_ORDER).toEqual(['keep', 'make_exception', 'change']);
    expect(Object.keys(CONTRACT_REVIEW_CHOICE_LABELS)).toHaveLength(3);
  });

  it('"keep" leaves the default response untouched', () => {
    expect(applyContractReview('I reply next business day.', 'keep')).toBe('I reply next business day.');
  });

  it('"make_exception" leaves the default response untouched - a one-off is never the new default', () => {
    expect(applyContractReview('I reply next business day.', 'make_exception')).toBe('I reply next business day.');
    expect(applyContractReview('I reply next business day.', 'make_exception', 'I will reply tonight just this once')).toBe('I reply next business day.');
  });

  it('"change" replaces the default only when real replacement text is given', () => {
    expect(applyContractReview('Old default.', 'change', 'New default.')).toBe('New default.');
    expect(applyContractReview('Old default.', 'change', '   ')).toBe('Old default.');
    expect(applyContractReview('Old default.', 'change')).toBe('Old default.');
  });
});

describe('Needs-revisiting signal: requires a real, consistent pattern, not one bad week', () => {
  const entry = (choice: ContractReviewEntry['choice']): ContractReviewEntry => ({ at: new Date().toISOString(), choice });

  it('stays silent below the minimum review count', () => {
    expect(suggestsContractNeedsRevisiting([entry('make_exception'), entry('make_exception')])).toBe(false);
  });

  it('flags a genuine exception-dominant pattern', () => {
    const history = [entry('make_exception'), entry('make_exception'), entry('keep')];
    expect(suggestsContractNeedsRevisiting(history)).toBe(true);
    expect(NEEDS_REVISITING_LINE).toBeTruthy();
  });

  it('stays silent when exceptions are not dominant', () => {
    const history = [entry('keep'), entry('keep'), entry('make_exception')];
    expect(suggestsContractNeedsRevisiting(history)).toBe(false);
  });
});

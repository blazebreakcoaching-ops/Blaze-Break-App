import { describe, it, expect } from 'vitest';
import {
  shouldKeepNovaPhrasing, createSweepItem, SMALLER_ACTION_RESOLVES, SMALLER_ACTION_REDUCES_TODAY,
  shouldOfferQuickSupportForSpark, MIN_SPARK_REPEATS_FOR_SUPPORT_OFFER, hasEnoughForResetStudioPattern,
  MIN_ENTRIES_FOR_RESET_STUDIO_PATTERN, RESET_STUDIO_STATES, RESET_STUDIO_STATE_ORDER, SparkAnswer,
} from './reset-studio-engine';

describe('RESET_STUDIO_STATES', () => {
  it('covers all six states in the brief, each mapped to its own tool', () => {
    expect(RESET_STUDIO_STATE_ORDER).toHaveLength(6);
    for (const id of RESET_STUDIO_STATE_ORDER) {
      expect(RESET_STUDIO_STATES[id].toolName).toBeTruthy();
    }
  });
});

describe('shouldKeepNovaPhrasing', () => {
  it('only a clear "yes" keeps Nova\'s own phrasing', () => {
    expect(shouldKeepNovaPhrasing('yes')).toBe(true);
    expect(shouldKeepNovaPhrasing('partly')).toBe(false);
    expect(shouldKeepNovaPhrasing('no')).toBe(false);
    expect(shouldKeepNovaPhrasing('rewrite')).toBe(false);
  });
});

describe('createSweepItem', () => {
  it('starts unsorted - never guesses a category from the text', () => {
    const item = createSweepItem('1', 'Call the dentist');
    expect(item.category).toBeNull();
  });
});

describe('Make It Smaller action mapping', () => {
  it('"now" items stay real - no resolution, no reduction', () => {
    expect(SMALLER_ACTION_RESOLVES.now).toBe(false);
    expect(SMALLER_ACTION_REDUCES_TODAY.now).toBe(false);
  });
  it('"later" reduces today without resolving the underlying demand', () => {
    expect(SMALLER_ACTION_RESOLVES.later).toBe(false);
    expect(SMALLER_ACTION_REDUCES_TODAY.later).toBe(true);
  });
  it('"not_mine" and "drop" both resolve and reduce', () => {
    expect(SMALLER_ACTION_RESOLVES.not_mine).toBe(true);
    expect(SMALLER_ACTION_REDUCES_TODAY.not_mine).toBe(true);
    expect(SMALLER_ACTION_RESOLVES.drop).toBe(true);
    expect(SMALLER_ACTION_REDUCES_TODAY.drop).toBe(true);
  });
});

describe('shouldOfferQuickSupportForSpark', () => {
  const concerning: SparkAnswer[] = ['miss_interest', 'dont_know', 'miss_interest'];

  it('is false below the minimum sample', () => {
    expect(shouldOfferQuickSupportForSpark(concerning.slice(0, MIN_SPARK_REPEATS_FOR_SUPPORT_OFFER - 1))).toBe(false);
  });
  it('is true once the last N answers are all concerning', () => {
    expect(shouldOfferQuickSupportForSpark(concerning)).toBe(true);
  });
  it('is false when a recent answer was not concerning', () => {
    const mixed: SparkAnswer[] = ['miss_interest', 'need_quiet', 'dont_know'];
    expect(shouldOfferQuickSupportForSpark(mixed)).toBe(false);
  });
  it('only looks at the most recent window, not the whole history', () => {
    const history: SparkAnswer[] = ['miss_interest', 'need_quiet', 'miss_interest', 'dont_know', 'miss_interest'];
    expect(shouldOfferQuickSupportForSpark(history)).toBe(true);
  });
});

describe('hasEnoughForResetStudioPattern', () => {
  it('requires a real minimum sample before any pattern is hypothesised', () => {
    expect(hasEnoughForResetStudioPattern(MIN_ENTRIES_FOR_RESET_STUDIO_PATTERN - 1)).toBe(false);
    expect(hasEnoughForResetStudioPattern(MIN_ENTRIES_FOR_RESET_STUDIO_PATTERN)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { hasExplicitNovaLearningConsent } from './nova-learning-consent';

describe('Nova behavioural learning requires an active affirmative choice', () => {
  it('accepts exactly true as consent', () => {
    expect(hasExplicitNovaLearningConsent(true)).toBe(true);
  });

  it('rejects missing, migrated, malformed and denied choices', () => {
    for (const value of [undefined, null, false, '', 'true', 1, 0, {}, []]) {
      expect(hasExplicitNovaLearningConsent(value)).toBe(false);
    }
  });
});

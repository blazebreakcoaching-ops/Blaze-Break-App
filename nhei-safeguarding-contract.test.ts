// NHEI PHASE 3C-2A - SECTION 13: SAFEGUARDING CONTRACT TESTS

import { describe, it, expect } from 'vitest';
import {
  UNINTEGRATED_SAFEGUARDING_GATE,
  NHEI_SAFEGUARDING_INTEGRATION_REQUIREMENTS,
} from './nhei-safeguarding-contract';

describe('UNINTEGRATED_SAFEGUARDING_GATE - fails closed', () => {
  it('always returns cleared: false, regardless of context - there is no real safeguarding layer to clear anything', async () => {
    const result = await UNINTEGRATED_SAFEGUARDING_GATE({ uid: 'u1', conversationId: 'c1' });
    expect(result.cleared).toBe(false);
    if (result.cleared === false) expect(result.reason).toBe('safeguarding_layer_not_integrated');
  });

  it('returns the same blocked result for any input - this is a constant fail-closed stance, not conditional logic', async () => {
    const a = await UNINTEGRATED_SAFEGUARDING_GATE({ uid: 'u1', conversationId: 'c1' });
    const b = await UNINTEGRATED_SAFEGUARDING_GATE({ uid: 'someone-else', conversationId: 'different-conversation' });
    expect(a).toEqual(b);
  });
});

describe('NHEI_SAFEGUARDING_INTEGRATION_REQUIREMENTS', () => {
  it('names every requirement section 13 explicitly calls for', () => {
    expect(Object.keys(NHEI_SAFEGUARDING_INTEGRATION_REQUIREMENTS).sort()).toEqual([
      'humanSupportOptions',
      'independentOfNhei',
      'modelOutputEvaluation',
      'privacyBoundaries',
      'runsBeforeSensitiveInterpretation',
      'youthSpecific',
    ]);
  });

  it('every requirement is a non-empty, substantive description, not a placeholder', () => {
    for (const value of Object.values(NHEI_SAFEGUARDING_INTEGRATION_REQUIREMENTS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(40);
    }
  });

  it('explicitly forbids NHEI from ever producing an autonomous crisis-risk score', () => {
    expect(NHEI_SAFEGUARDING_INTEGRATION_REQUIREMENTS.privacyBoundaries).toContain('No autonomous');
  });
});

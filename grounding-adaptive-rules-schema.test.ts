import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PATTERN_DIMENSION_ORDER } from './grounding-patterns-taxonomy';
import { GROUNDING_LENS_ORDER } from './grounding-content';

// Phase 3: cross-checks firestore.rules' 5 new adaptive-grounding
// collections against the real code they're meant to constrain (same
// no-emulator approach as grounding-rules-schema.test.ts / questioning-
// style-rules.test.ts - there is no Firestore emulator wired into
// `npm run test` in this environment).

const rulesText = readFileSync(join(__dirname, 'firestore.rules'), 'utf8');

function extractBlock(marker: string): string {
  const start = rulesText.indexOf(marker);
  if (start === -1) throw new Error(`Could not find "${marker}" in firestore.rules`);
  const end = rulesText.indexOf('\n      }', start);
  if (end === -1) throw new Error(`Could not find the end of the "${marker}" rule block`);
  return rulesText.slice(start, end);
}

function extractEnumValues(source: string, marker: string): string[] {
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error(`Could not find "${marker}" in source`);
  const arrayMatch = source.slice(idx).match(/\[([^\]]*)\]/);
  if (!arrayMatch) throw new Error(`Could not parse an array literal after "${marker}"`);
  return arrayMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

describe('firestore.rules — groundingProfile/main', () => {
  const block = extractBlock('match /groundingProfile/{docId} {');

  it('is pinned to a single fixed doc id, not an open collection', () => {
    expect(block).toContain("docId == 'main'");
  });

  it('constrains preferredSessionDepth to exactly the 3 real session depths', () => {
    expect(extractEnumValues(block, 'preferredSessionDepth in')).toEqual(['reset', 'ground', 'deep']);
  });

  it('constrains commonCapacityState to exactly the 4 real capacity states', () => {
    expect(extractEnumValues(block, 'commonCapacityState in')).toEqual(['running_on_empty', 'low_capacity', 'some_space', 'ready_to_reflect']);
  });

  it('constrains preferredClosingStyle to exactly the 5 real closing styles', () => {
    expect(extractEnumValues(block, 'preferredClosingStyle in')).toEqual(['practical', 'compassionate', 'values', 'faith_friendly', 'islamic']);
  });

  it('constrains preferredLens to exactly the real 4 grounding lenses', () => {
    expect(new Set(extractEnumValues(block, 'preferredLens in'))).toEqual(new Set(GROUNDING_LENS_ORDER));
  });
});

describe('firestore.rules — groundingPromptHistory', () => {
  const block = extractBlock('match /groundingPromptHistory/{promptId} {');

  it('accepts exactly the 27 real taxonomy dimension ids for patternKey', () => {
    expect(new Set(extractEnumValues(block, 'patternKey in'))).toEqual(new Set(PATTERN_DIMENSION_ORDER));
  });

  it('owner can delete a prompt-history doc outright (personalisation reset, section 37)', () => {
    expect(block).toMatch(/allow read, delete: if isOwner\(uid\)/);
  });
});

describe('firestore.rules — every Phase 3 collection is owner-deletable', () => {
  for (const collection of ['groundingProfile', 'groundingPromptHistory', 'groundingFeedback', 'groundingRoutines', 'savedReflections']) {
    it(`${collection} allows owner delete`, () => {
      const block = extractBlock(`match /${collection}/{`);
      expect(block).toMatch(/allow read, delete: if isOwner\(uid\)/);
    });
  }
});

describe('firestore.rules — grounding_sessions accepts Phase 3\'s new sessionDepth/capacityState fields', () => {
  const block = extractBlock('match /grounding_sessions/{sessionId} {');

  it('constrains sessionDepth to exactly the 3 real session depths', () => {
    expect(extractEnumValues(block, 'sessionDepth in')).toEqual(['reset', 'ground', 'deep']);
  });

  it('constrains capacityState to exactly the 4 real capacity states', () => {
    expect(extractEnumValues(block, 'capacityState in')).toEqual(['running_on_empty', 'low_capacity', 'some_space', 'ready_to_reflect']);
  });

  it('both new fields are in the write allowlist', () => {
    const hasOnlyMatch = block.match(/hasOnly\(\[([^\]]*)\]\)/);
    expect(hasOnlyMatch).toBeTruthy();
    const fields = hasOnlyMatch![1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    expect(fields).toContain('sessionDepth');
    expect(fields).toContain('capacityState');
  });
});

describe('firestore.rules — groundingFeedback has no free-text field beyond one short optional note', () => {
  it('the write allowlist is selectedOptions/helpfulNote/sessionDepth/createdAt only', () => {
    const block = extractBlock('match /groundingFeedback/{feedbackId} {');
    const hasOnlyMatch = block.match(/hasOnly\(\[([^\]]*)\]\)/);
    expect(hasOnlyMatch).toBeTruthy();
    const fields = hasOnlyMatch![1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    expect(new Set(fields)).toEqual(new Set(['selectedOptions', 'helpfulNote', 'sessionDepth', 'createdAt']));
  });
});

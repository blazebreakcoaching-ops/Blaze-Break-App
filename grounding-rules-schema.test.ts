import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PATTERN_DIMENSION_ORDER, PATTERN_CATEGORIES } from './grounding-patterns-taxonomy';

// Batch 6 hardening: locks in several of Phase 2's acceptance tests that
// are properties of firestore.rules itself rather than of any pure
// function - specifically "not really" suppression (the reflection_
// patterns schema must actually accept the fields the client writes) and
// pattern deletion cascade (every collection deleteHistory() batch-
// deletes in FaithValuesMode.tsx must actually be owner-deletable).
//
// Mirrors questioning-style-rules.test.ts's approach: no Firestore
// emulator is wired into `npm run test` in this environment, so this
// parses the real firestore.rules text as data and cross-checks it
// against the real taxonomy the app code uses, rather than skipping
// this class of bug entirely.

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

describe('firestore.rules — reflection_patterns matches the real taxonomy', () => {
  const block = extractBlock('match /reflection_patterns/{patternId} {');

  it('owner can delete a pattern doc outright - required for the pattern deletion cascade', () => {
    expect(block).toMatch(/allow read, delete: if isOwner\(uid\)/);
  });

  it('accepts exactly the 27 real taxonomy dimension ids, no more, no fewer', () => {
    const ruleValues = extractEnumValues(block, 'request.resource.data.patternKey in');
    expect(new Set(ruleValues)).toEqual(new Set(PATTERN_DIMENSION_ORDER));
  });

  it('accepts exactly the 8 real taxonomy category ids', () => {
    const ruleValues = extractEnumValues(block, 'request.resource.data.category in');
    expect(new Set(ruleValues)).toEqual(new Set(Object.keys(PATTERN_CATEGORIES)));
  });

  it('constrains "not really" suppression to the two real feedback values, and paused/suppressed to booleans - never a bare string/any check', () => {
    expect(block).toMatch(/userFeedback in \['resonates', 'not_really'\]/);
    expect(block).toMatch(/paused' in request\.resource\.data\) \|\| request\.resource\.data\.paused is bool/);
    expect(block).toMatch(/suppressed' in request\.resource\.data\) \|\| request\.resource\.data\.suppressed is bool/);
  });
});

describe('firestore.rules — the whole grounding pattern-cascade is owner-deletable', () => {
  // deleteHistory() in FaithValuesMode.tsx batch-deletes grounding_sessions,
  // reflection_patterns, aligned_actions and grounding_analytics_events
  // together, on the reasoning that the latter three only exist as a
  // function of the sessions they were derived from - stranding any of
  // them behind would leave unexplainable orphan data, or (for analytics
  // events) an unexplained trail of the very history "delete all grounding
  // history" claims to remove. Every collection in that batch must
  // actually permit owner delete, or the bulk delete silently fails partway
  // through.
  for (const collection of ['grounding_sessions', 'reflection_patterns', 'aligned_actions', 'grounding_analytics_events']) {
    it(`${collection} allows owner delete`, () => {
      const block = extractBlock(`match /${collection}/{`);
      expect(block).toMatch(/allow read, delete: if isOwner\(uid\)/);
    });
  }
});

describe('firestore.rules — grounding_analytics_events never has a free-text field', () => {
  it('the write allowlist has exactly eventType/category/lens/createdAt - no field capable of carrying raw reflection text', () => {
    const block = extractBlock('match /grounding_analytics_events/{eventId} {');
    const hasOnlyMatch = block.match(/hasOnly\(\[([^\]]*)\]\)/);
    expect(hasOnlyMatch).toBeTruthy();
    const fields = hasOnlyMatch![1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    expect(new Set(fields)).toEqual(new Set(['eventType', 'category', 'lens', 'createdAt']));
  });
});

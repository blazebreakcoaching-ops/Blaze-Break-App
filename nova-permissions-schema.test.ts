import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Regression coverage for a real bug: users/{uid}/nova_permissions/current
// required (hasAll) four fields - allowNovaMemorySuggestions,
// allowNovaRememberCoachingPreferences, allowNovaRememberRecoveryPatterns,
// allowNovaRememberGoals - that no client or server code anywhere ever
// wrote. Because hasAll requires them, EVERY attempt to create this doc
// (onboarding, the existing-account backfill) has always been silently
// rejected by Firestore's security rules, meaning Nova has never actually
// had a permissions doc for any account, and server.ts's
// getNovaContextAndMetadata has always taken its "no context" branch.
//
// This is exactly the kind of thing a live Firestore rules emulator would
// catch, but this repo's test-rules.cjs needs a running emulator and isn't
// part of `npm run test` (nothing in package.json's scripts wires it in) -
// so it was never actually exercised. This test doesn't need an emulator:
// it parses the real firestore.rules text and the real
// NOVA_PERMISSION_DEFAULTS object as data and asserts the one invariant
// that matters - every field the rule requires (hasAll) is actually
// supplied by every code path that can create the doc - so this class of
// "rule requires a field nothing writes" bug fails a normal `npm run test`
// run from now on, in this doc and any future one shaped like it.

const rulesText = readFileSync(join(__dirname, 'firestore.rules'), 'utf8');
const novaBrainText = readFileSync(join(__dirname, 'src/lib/nova-brain.ts'), 'utf8');

function extractFieldList(source: string, arrayLiteral: string): string[] {
  const match = arrayLiteral.match(/\[([^\]]*)\]/);
  if (!match) throw new Error('Could not parse field array from: ' + arrayLiteral.slice(0, 80));
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

function extractNovaPermissionsBlock(): string {
  const start = rulesText.indexOf('match /nova_permissions/current {');
  if (start === -1) throw new Error('nova_permissions/current rule block not found');
  // The block ends at the next top-level "      }" (six-space indent,
  // matching this file's nesting) after the match opens.
  const end = rulesText.indexOf('\n      }', start);
  if (end === -1) throw new Error('Could not find end of nova_permissions/current block');
  return rulesText.slice(start, end);
}

describe('nova_permissions/current schema consistency', () => {
  const block = extractNovaPermissionsBlock();

  const hasOnlyMatch = block.match(/hasOnly\(\[[^\]]*\]\)/);
  const hasAllMatch = block.match(/hasAll\(\[[^\]]*\]\)/);
  expect(hasOnlyMatch, 'expected a hasOnly([...]) clause').not.toBeNull();
  expect(hasAllMatch, 'expected a hasAll([...]) clause').not.toBeNull();

  const hasOnlyFields = extractFieldList(rulesText, hasOnlyMatch![0]);
  const hasAllFields = extractFieldList(rulesText, hasAllMatch![0]);

  // NOVA_PERMISSION_DEFAULTS' own keys, plus the two memory fields every
  // create-path caller (initNovaPermissionsForNewUser,
  // ensureNovaPermissionsExist) adds on top of the spread defaults.
  const defaultsMatch = novaBrainText.match(/const NOVA_PERMISSION_DEFAULTS = \{([\s\S]*?)\n\};/);
  expect(defaultsMatch, 'expected to find NOVA_PERMISSION_DEFAULTS in nova-brain.ts').not.toBeNull();
  const defaultsFields = Array.from(defaultsMatch![1].matchAll(/^\s*(allow[A-Za-z]+):/gm)).map((m) => m[1]);
  const alwaysSuppliedByCreators = ['allowNovaMemory', 'allowNovaUseSavedMemories', 'updatedAt'];
  const actuallyWrittenOnCreate = new Set([...defaultsFields, ...alwaysSuppliedByCreators]);

  it('NOVA_PERMISSION_DEFAULTS is non-trivial (sanity check the parse worked)', () => {
    expect(defaultsFields.length).toBeGreaterThan(10);
  });

  it('every field required by hasAll is actually supplied by the code that creates this doc', () => {
    const missing = hasAllFields.filter((f) => !actuallyWrittenOnCreate.has(f));
    expect(missing, `hasAll requires these fields but nothing writes them, so this doc can never be created: ${missing.join(', ')}`).toEqual([]);
  });

  it('every field the creators actually write is allowed by hasOnly (no field silently rejected)', () => {
    const rejected = [...actuallyWrittenOnCreate].filter((f) => !hasOnlyFields.includes(f));
    expect(rejected, `these fields are written on create but missing from hasOnly, so every create fails: ${rejected.join(', ')}`).toEqual([]);
  });

  it('hasAll is a subset of hasOnly (a required field that is also disallowed would make creation impossible)', () => {
    const contradictory = hasAllFields.filter((f) => !hasOnlyFields.includes(f));
    expect(contradictory).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Coverage for the closed-enum requirement on
// users/{uid}/user_stats/core.profile.questioningStyle: the server folds
// this value straight into Nova's own prompt (buildNovaQuestioningStyleModule
// / buildNovaStyleToneModule in server.ts, keyed by the raw string), so a
// client able to write an arbitrary string there would have a direct
// prompt-injection path into Nova's own instructions. firestore.rules must
// restrict it to exactly the four selectable styles (or null/absent for
// "off"), never a bare "is string" check.
//
// This is exactly the kind of thing a live Firestore rules emulator would
// catch, but this repo's test-rules.cjs needs a running emulator and isn't
// part of `npm run test` (see nova-permissions-schema.test.ts for the same
// note) - so it was never actually exercised. This test doesn't need an
// emulator: it parses the real firestore.rules text and the real style
// constant objects in server.ts as data, and asserts the enum in the rule
// exactly matches the enum the code actually accepts - so a future style
// added to one and not the other (in either direction) fails a normal
// `npm run test` run.

const rulesText = readFileSync(join(__dirname, 'firestore.rules'), 'utf8');
const serverText = readFileSync(join(__dirname, 'server.ts'), 'utf8');

function extractUserStatsCoreBlock(): string {
  const start = rulesText.indexOf('match /user_stats/core {');
  if (start === -1) throw new Error('user_stats/core rule block not found');
  const end = rulesText.indexOf('\n      }', start);
  if (end === -1) throw new Error('Could not find the end of the user_stats/core rule block');
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

describe('firestore.rules — questioningStyle is a closed enum', () => {
  const rulesBlock = extractUserStatsCoreBlock();

  it('restricts profile.questioningStyle to a fixed list of allowed values, not a bare string check', () => {
    expect(rulesBlock).toContain('questioningStyle');
    // The rule must check membership in a specific list, never accept any
    // string - "is string" alone would be a prompt-injection path.
    expect(rulesBlock).toMatch(/profile\.questioningStyle in \[[^\]]+\]/);
    expect(rulesBlock).not.toContain('profile.questioningStyle is string');
  });

  it('explicitly allows null (the "off"/default sentinel), not just a bare enum check', () => {
    expect(rulesBlock).toMatch(/profile\.questioningStyle == null/);
  });

  it("the rule's allowed values exactly match the four styles the code actually recognises", () => {
    const ruleValues = extractEnumValues(rulesBlock, 'profile.questioningStyle in');
    // buildNovaQuestioningStyleModule and buildNovaStyleToneModule are both
    // keyed off the same NovaQuestioningStyle union - checking against the
    // type declaration catches drift regardless of which function's object
    // literal happens to list its keys in a different order.
    const typeDeclMatch = serverText.match(/type NovaQuestioningStyle = ([^;]+);/);
    expect(typeDeclMatch).toBeTruthy();
    const codeValues = (typeDeclMatch![1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''));

    expect(codeValues.length).toBeGreaterThan(0);
    expect(new Set(ruleValues)).toEqual(new Set(codeValues));
  });
});

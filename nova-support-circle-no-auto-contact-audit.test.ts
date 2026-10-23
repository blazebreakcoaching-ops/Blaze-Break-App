// Phase 5B, directive §6: "No automatic outbound contacts based on an
// NHEI interpretation." This is a static regression guard, not a
// behavioural test - it proves, by reading source text, that neither
// direction of import exists between NHEI and the real, live Support
// Circle / Guardian Relay / Recovery Ally code. If a future change ever
// adds one of these imports, this test is the trip-wire.
//
// Audited before writing this (Phase 5B delivery report): the real
// Guardian/Support files are `guardian-alert.ts`, `support-capsules.ts`,
// `recovery-ally-consent.ts`, `ally-nudge-quiet-hours.ts`, plus every
// `src/components/*.tsx` file whose name matches Guardian/Ally/Support
// Circle. Every real outbound send in `guardian-alert.ts` is gated on an
// explicit, same-moment user tap, never a background or scheduled
// trigger - Tier 3 (unattended scheduled messaging) is a hardcoded-OFF
// kill-switch pending clinical/safeguarding/legal review per
// docs/GUARDIAN_SUPPORT_SPEC.md.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname);
const IMPORT_FROM_NHEI = /from\s+['"][^'"]*\bnhei-[^'"]*['"]/;

const SUPPORT_CIRCLE_SOURCE_FILES = [
  'guardian-alert.ts',
  'support-capsules.ts',
  'recovery-ally-consent.ts',
  'ally-nudge-quiet-hours.ts',
].map((f) => path.join(ROOT, f));

function listTsxFilesMatching(pattern: RegExp): string[] {
  const dir = path.join(ROOT, 'src', 'components');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tsx') && pattern.test(f)).map((f) => path.join(dir, f));
}

describe('Support Circle / Guardian Relay / Recovery Ally never import NHEI', () => {
  const files = [
    ...SUPPORT_CIRCLE_SOURCE_FILES,
    ...listTsxFilesMatching(/guardian|ally|supportcircle|mysupportcircle/i),
  ].filter((f) => fs.existsSync(f));

  it('found at least the known real Support Circle source files (sanity check that the audit still matches reality)', () => {
    expect(files.length).toBeGreaterThanOrEqual(SUPPORT_CIRCLE_SOURCE_FILES.length);
  });

  it.each(files.map((f) => [path.relative(ROOT, f), f] as const))('%s does not import any nhei- file', (_label, file) => {
    const content = fs.readFileSync(file, 'utf8');
    expect(content).not.toMatch(IMPORT_FROM_NHEI);
  });
});

describe('No NHEI file imports Support Circle / Guardian Relay / Recovery Ally', () => {
  const nheiFiles = fs.readdirSync(ROOT).filter((f) => f.startsWith('nhei-') && f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const guardianImportPattern = /from\s+['"][^'"]*(guardian-alert|support-capsules|recovery-ally-consent|ally-nudge-quiet-hours)['"]/i;

  it('found at least one real nhei- source file (sanity check)', () => {
    expect(nheiFiles.length).toBeGreaterThan(0);
  });

  it.each(nheiFiles)('%s does not import any Support Circle / Guardian Relay file', (file) => {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(content).not.toMatch(guardianImportPattern);
  });
});

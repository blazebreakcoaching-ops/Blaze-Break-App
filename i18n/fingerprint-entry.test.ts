import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PACKS, translate, type TranslationKey } from './index';
const keys = [
  'fingerprint.choiceTitle', 'fingerprint.choiceSubtitle',
  'fingerprint.quickTitle', 'fingerprint.fullTitle',
  'fingerprint.progress', 'fingerprint.working',
  'fingerprint.errorTitle', 'fingerprint.retry',
] as const satisfies readonly TranslationKey[];
const source = readFileSync('src/components/DiagnoseSection.tsx', 'utf8');

describe('Burnout Fingerprint multilingual UI contract', () => {
  it('has all eight strings for each bundled language without missing variables', () => {
    for (const locale of Object.keys(PACKS) as Array<keyof typeof PACKS>) {
      for (const key of keys) {
        const value = PACKS[locale][key];
        expect(value?.trim(), locale + ' ' + key).toBeTruthy();
        if (key === 'fingerprint.progress') {
          expect(value).toContain('{current}');
          expect(value).toContain('{total}');
          expect(translate(locale, key, { current: 2, total: 7 })).not.toContain('{current}');
        }
      }
    }
  });
  it('keeps the same scored questions and seven-question quick route', () => {
    expect(source).toContain("const QUICK_CHECK_IDS = ['workload', 'boundaries'");
    expect(source).toContain('handleAnswer(option.value)');
    expect(source).toContain("mode === 'quick'");
  });
  it('shows shared localized UI text without translating raw answer IDs', () => {
    for (const key of keys) expect(source).toContain("t('" + key + "'");
    expect(source).toContain('data: { answers: finalAnswers, letNovaLearn }');
  });
});

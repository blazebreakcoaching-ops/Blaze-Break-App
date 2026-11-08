import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PACKS, type TranslationKey } from './index';

const quickIds = ['workload','boundaries','peoplePleasing','guilt',
  'sleep','emotionalOverload','meaning'] as const;
const view = readFileSync('src/components/DiagnoseSection.tsx', 'utf8');

describe('quick Fingerprint answer translations and scoring invariants', () => {
  it('includes four explicit choices for every quick question in all languages', () => {
    expect(quickIds).toHaveLength(7);
    for (const [code, pack] of Object.entries(PACKS)) {
      for (const id of quickIds) {
        for (const value of [1,2,3,4]) {
          const key = ('fingerprint.option.' + id + '.' + value) as TranslationKey;
          expect(pack[key]?.trim(), code + ' missing ' + key).toBeTruthy();
        }
      }
      expect(pack['fingerprint.fullEnglishNotice']?.trim()).toBeTruthy();
    }
  });
  it('uses translated choices only for the seven-question route', () => {
    expect(view).toContain("mode === 'quick'");
    expect(view).toContain("t(('fingerprint.option.' + activeQuestions[step].id + '.' + option.value) as TranslationKey)");
    expect(view).toContain("mode === 'full' && locale !== 'en'");
    expect(view).toContain("t('fingerprint.fullEnglishNotice')");
    expect(view).toContain("activeQuestions[step].text");
    expect(view).toContain("option.text");
  });
  it('does not mutate persistent answer keys or 1-4 scores', () => {
    expect(view).toContain('[activeQuestions[step].id]: val');
    expect(view).toContain('handleAnswer(option.value)');
    expect(view).toContain('data: { answers: finalAnswers, letNovaLearn }');
  });
  it('keeps failures visible even on the assessment selection screen', () => {
    expect(view).toContain("mode === 'choice' && !loading && !error");
    expect(view).not.toContain('Leak Category:');
  });
});

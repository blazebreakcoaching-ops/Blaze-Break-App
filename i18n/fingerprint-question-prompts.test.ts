import { describe, expect, it } from 'vitest';
import { en, PACKS, type TranslationKey } from './index';
import { readFileSync } from 'node:fs';

const questionIds = [
  'workload', 'boundaries', 'peoplePleasing', 'guilt', 'sleep',
  'emotionalOverload', 'meaning', 'selfDoubt', 'delegationControl',
  'maskingLoad', 'caregivingLoad', 'crisisDependency',
  'emotionalPerformance', 'responsibilityCreep',
] as const;
const file = readFileSync('src/components/DiagnoseSection.tsx', 'utf8');

describe('Burnout Fingerprint question localisation', () => {
  it('has all 14 question prompts across 12 supported locales', () => {
    expect(questionIds).toHaveLength(14);
    for (const locale of Object.keys(PACKS) as Array<keyof typeof PACKS>) {
      for (const id of questionIds) {
        const key = ('fingerprint.question.' + id) as TranslationKey;
        expect(en[key]?.trim(), 'missing English ' + key).toBeTruthy();
        expect(PACKS[locale][key]?.trim(), locale + ' missing ' + key).toBeTruthy();
      }
    }
  });
  it('uses the existing IDs for translated display only, not answer writes', () => {
    expect(file).toContain("t(('fingerprint.question.' + activeQuestions[step].id) as TranslationKey)");
    expect(file).toContain('[activeQuestions[step].id]: val');
    expect(file).toContain('handleAnswer(option.value)');
    expect(file).toContain('data: { answers: finalAnswers, letNovaLearn }');
  });
  it('does not imply answer-option translations or validation are complete', () => {
    expect(file).toContain('{option.text}');
    expect(file).toContain("const QUICK_CHECK_IDS = ['workload', 'boundaries'");
  });
});

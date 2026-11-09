import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en, LOCALE_CODES, PACKS, translate } from './index';

const keys = ["feedback.title","feedback.description","feedback.better","feedback.same","feedback.notReally","feedback.unsure","feedback.reset","feedback.resetDetails","feedback.confirmReset","feedback.cancel","feedback.review","feedback.hide","feedback.none","feedback.loading","feedback.correct","feedback.forget","feedback.correctAria","feedback.forgetAria","feedback.outcome","feedback.older","feedback.loadingOlder","feedback.reload","feedback.error.history","feedback.error.correct","feedback.error.incomplete","feedback.error.reset","feedback.error.forget"] as const;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
describe('adaptive feedback localisation', () => {
  it('covers all feedback text in every supported language with matching placeholders', () => {
    for (const key of keys) {
      expect(en[key]).toBeTruthy();
      for (const code of LOCALE_CODES) {
        expect(PACKS[code][key]).toBeTruthy();
        expect(placeholders(translate(code, key))).toEqual(placeholders(en[key]));
      }
    }
  });
  it('preserves stable API enum values, member guards, and locale-aware dates', () => {
    const src = readFileSync('src/components/AdaptiveFeedbackHistory.tsx', 'utf8');
    for (const value of ['better', 'same', 'not_really', 'not_sure']) expect(src).toContain(value);
    expect(src).toContain('useI18n()');
    expect(src).toContain("t('feedback.resetDetails')");
    expect(src).toContain("t('feedback.forgetAria'");
    expect(src).toContain('localizedRecoveryModuleName(locale, item.module)');
    expect(src).not.toContain('moduleDisplayName(item.module)');
    expect(src).toContain('intlLocale(locale)');
    expect(src).toContain("'?cursor=' + encodeURIComponent(cursor)");
    expect(src).toContain('auth.currentUser !== user');
    expect(src).toContain('}, [user]);');
  });
});

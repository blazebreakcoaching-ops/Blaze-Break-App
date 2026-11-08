import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PACKS, SUPPORTED_LOCALES, translate, en, type TranslationKey } from './index';

const CONSENT_KEYS = [
  'onboarding.privacyTitle', 'onboarding.privacySubtitle',
  'onboarding.protectionTitle', 'onboarding.protectionBody',
  'onboarding.greetingConsent', 'onboarding.greetingConsentDetail',
  'onboarding.learningConsent', 'onboarding.learningConsentDetail',
  'onboarding.remindersConsent', 'onboarding.remindersConsentDetail',
] as const satisfies readonly TranslationKey[];

describe('consent-first onboarding translation', () => {
  it('includes all consent keys for every supported locale', () => {
    for (const language of SUPPORTED_LOCALES) {
      for (const key of CONSENT_KEYS) {
        expect(PACKS[language.code][key], language.code + ':' + key).toBeTruthy();
        expect(translate(language.code, key).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the English consent source and all AI-assisted drafts separate', () => {
    expect(en['onboarding.learningConsentDetail']).toContain('Allow Nova');
    expect(SUPPORTED_LOCALES.filter(x => x.code !== 'en').every(x => x.status === 'machine-draft')).toBe(true);
  });

  it('translates consent display and accessible switch labels without altering stored answers', () => {
    const ui = readFileSync('src/components/SituationalOnboarding.tsx', 'utf8');
    expect(ui).toContain('t("onboarding.privacyTitle")');
    expect(ui).toContain('t("onboarding.learningConsentDetail")');
    expect(ui).toContain('aria-label={`${t("onboarding.learningConsent")}: ${t("onboarding.learningConsentDetail")}`}');
    expect(ui).toContain('letNovaLearn: false');
    expect(ui).toContain('handleSelect(steps[step].field!, opt.label)');
  });
});

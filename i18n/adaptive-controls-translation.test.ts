import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALE_CODES, PACKS, en, translate } from './index';
import { localizedRecoveryModuleName } from './recovery-module-labels';

const keys = ["adaptive.title","adaptive.description","adaptive.allowAria","adaptive.on","adaptive.off","adaptive.loadError","adaptive.retry","adaptive.memoryRequired","adaptive.preferencesHelp","adaptive.choice.none","adaptive.choice.more","adaptive.choice.less","adaptive.choiceAria","adaptive.saveError"] as const;
const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('adaptive settings UI localisation and consent boundaries', () => {
  it('provides complete text and matching interpolations in all twelve locales', () => {
    for (const locale of LOCALE_CODES) {
      for (const key of keys) {
        expect(PACKS[locale][key]?.trim().length).toBeGreaterThan(0);
        expect(placeholders(translate(locale, key))).toEqual(placeholders(en[key]));
      }
    }
  });

  it('keeps stable stored module ids while translating the customer-facing names', () => {
    for (const locale of LOCALE_CODES) {
      expect(localizedRecoveryModuleName(locale, 'guided_reset')).toBe(PACKS[locale]['module.guided_reset']);
      expect(localizedRecoveryModuleName(locale, 'my_patterns')).toBe(PACKS[locale]['module.my_patterns']);
    }
  });

  it('guards same-UID re-authentication and resets pending changes in the settings UI', () => {
    const ui = readFileSync('src/components/NovaAdaptiveControls.tsx', 'utf8');
    expect(ui).toContain('ownerSession === user && auth.currentUser === user');
    expect(ui).toContain('auth.currentUser !== requestUser || ownerSession !== requestUser');
    expect(ui).toContain('}, [user, retry]);');
    expect(ui).toContain('localizedRecoveryModuleName(locale, id)');
    expect(ui).toContain("t('adaptive.allowAria')");
    expect(ui).toContain("t('adaptive.memoryRequired')");
    expect(ui).toContain("t('adaptive.choiceAria'");
    expect(ui).not.toContain("ownerUid");
  });
});

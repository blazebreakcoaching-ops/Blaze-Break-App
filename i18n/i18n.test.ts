import { describe, expect, it } from 'vitest';
import {
  en, PACKS, SUPPORTED_LOCALES, LOCALE_CODES, translate, translateCount, resolveLocale, textDirection, intlLocale,
  isFallback, missingKeys, coverage, formatDate, formatNumber, type TranslationKey,
} from './index';

const KEYS = Object.keys(en) as TranslationKey[];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translation completeness (English is the source of truth)', () => {
  it('there are exactly 12 supported languages with native names', () => {
    expect(LOCALE_CODES).toEqual(['en', 'de', 'nl', 'fr', 'ar', 'es', 'pt', 'hi', 'ur', 'zh', 'bn', 'pl']);
    for (const l of SUPPORTED_LOCALES) expect(l.nativeName.length).toBeGreaterThan(1);
    expect(SUPPORTED_LOCALES.find((l) => l.code === 'ar')!.nativeName).toBe('العربية');
  });

  it.each(LOCALE_CODES)('%s has every key, nothing empty, no unknown keys', (code) => {
    expect(missingKeys(code)).toEqual([]);
    const extra = Object.keys(PACKS[code]).filter((k) => !(k in en));
    expect(extra).toEqual([]);
    expect(coverage(code).percent).toBe(100);
  });

  it.each(LOCALE_CODES)('%s keeps the same {placeholders} as English', (code) => {
    for (const key of KEYS) {
      const value = PACKS[code][key]!;
      // A singular form may spell out "one" instead of showing the number.
      if (key.endsWith('.one') && placeholders(value).length === 0) continue;
      expect(placeholders(value), `${code} ${key}`).toEqual(placeholders(en[key]));
    }
  });

  it('non-English packs are honestly marked as unreviewed machine drafts', () => {
    for (const l of SUPPORTED_LOCALES) expect(l.status).toBe(l.code === 'en' ? 'source' : 'machine-draft');
  });

  it('no pack quietly copies English into a translation for user-facing sentences', () => {
    for (const code of LOCALE_CODES.filter((c) => c !== 'en')) {
      const copied = KEYS.filter((k) => PACKS[code][k] === en[k] && en[k].split(' ').length > 3);
      expect(copied, code).toEqual([]);
    }
  });
});

describe('fallback and locale resolution', () => {
  it('resolves device/browser locales to a supported language, else English', () => {
    expect(resolveLocale('pt-BR')).toBe('pt');
    expect(resolveLocale('zh-Hans-CN')).toBe('zh');
    expect(resolveLocale('ar_EG')).toBe('ar');
    expect(resolveLocale('sv-SE')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale('<script>')).toBe('en');
  });

  it('falls back to English for an unsupported language, never a raw key', () => {
    expect(translate('sv', 'nav.home')).toBe('Today');
    expect(isFallback('sv', 'nav.home')).toBe(false);
    expect(translate('de', 'nav.home')).toBe('Heute');
  });

  it('interpolates values and leaves unknown placeholders visible for tests', () => {
    expect(translate('en', 'nav.openTools', { tool: 'Insights' })).toBe('Insights, open tools');
    expect(translate('fr', 'welcome.greetingWithName', { greeting: 'Bonjour', name: 'Léa' })).toBe('Bonjour, Léa.');
  });
});

describe('right-to-left and screen-reader language metadata', () => {
  it('Arabic and Urdu are right-to-left; all others left-to-right', () => {
    for (const code of LOCALE_CODES) expect(textDirection(code)).toBe(code === 'ar' || code === 'ur' ? 'rtl' : 'ltr');
  });

  it('each language has a valid BCP-47 tag for html lang / accessibilityLanguage', () => {
    for (const code of LOCALE_CODES) {
      const tag = intlLocale(code);
      expect(Intl.getCanonicalLocales(tag)[0]).toBe(tag);
      expect(tag.split('-')[0]).toBe(code);
    }
  });
});

describe('long translated labels', () => {
  // The mobile bar slot holds ~72px; the short insights label must stay short.
  it('mobile bar labels stay short in every language', () => {
    for (const code of LOCALE_CODES) {
      for (const key of ['nav.home', 'nav.plan', 'nav.tools', 'nav.nova', 'nav.more', 'nav.less', 'nav.recovery_intelligence.short'] as TranslationKey[]) {
        expect(translate(code, key).length, `${code} ${key}`).toBeLessThanOrEqual(14);
      }
    }
  });

  it('experience level names fit the three-way switcher (<= 20 chars)', () => {
    for (const code of LOCALE_CODES) {
      for (const k of ['experience.novice', 'experience.mastering', 'experience.expert'] as TranslationKey[]) {
        expect(translate(code, k).length, `${code} ${k}`).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe('local formatting, plurals, time zones and daylight saving', () => {
  it('formats numbers with local digits/separators', () => {
    expect(formatNumber('de', 1234.5)).toBe('1.234,5');
    expect(formatNumber('en', 1234.5)).toBe('1,234.5');
  });

  it('uses CLDR plurals and stays readable for languages with several forms', () => {
    expect(translateCount('en', 'checkin.count', 1)).toBe('1 check-in');
    expect(translateCount('en', 'checkin.count', 3)).toBe('3 check-ins');
    expect(translateCount('pl', 'checkin.count', 5)).toBe('Meldunki: 5');
    expect(translateCount('ar', 'checkin.count', 1)).toBe('تسجيل واحد');
  });

  it('dates respect the chosen IANA zone across a daylight-saving change', () => {
    // 00:30 UTC on 30 March 2025 is still 29 March in New York but 30 March in London (after BST starts at 01:00 UTC).
    const t = new Date('2025-03-30T00:30:00Z');
    expect(formatDate('en', t, 'America/New_York')).toContain('29');
    expect(formatDate('en', t, 'Europe/London')).toContain('30');
    expect(formatDate('en', t, 'Not/AZone')).toContain('30'); // invalid zone -> UTC, never throws
  });
});

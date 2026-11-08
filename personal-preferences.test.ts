import { describe, expect, it } from 'vitest';
import {
  canonicalPreferenceWrites, preferencesFromWebProfile, resolvePersonalPreferences, sanitisePersonalPreferences,
  webProfileFieldsFrom,
} from './personal-preferences';

describe('one canonical personal-preference record for web and native', () => {
  it('reads native canonical fields first, then falls back to legacy web profile fields', () => {
    const fromNative = resolvePersonalPreferences({
      root: { preferredName: 'Sam', timezone: 'Asia/Tokyo', country: 'Japan' },
      ui: { greetingTone: 'direct', usePreferredName: true, greetingEnabled: true },
      legacyProfile: { preferredName: 'Old', timeZone: 'Europe/London', greetingTone: 'simple' },
    });
    expect(fromNative).toMatchObject({ preferredName: 'Sam', timeZone: 'Asia/Tokyo', region: 'Japan', tone: 'direct', useName: true });

    const legacyOnly = resolvePersonalPreferences({ legacyProfile: { preferredName: 'Ana', timeZone: 'America/New_York', region: 'US', greetingTone: 'simple', useNameInGreetings: true } });
    expect(legacyOnly).toMatchObject({ preferredName: 'Ana', timeZone: 'America/New_York', region: 'US', tone: 'simple', useName: true });
  });

  it('keeps an explicit opt-out from either platform (name use and welcome messages)', () => {
    expect(resolvePersonalPreferences({ root: { preferredName: 'Sam' }, ui: { usePreferredName: true }, legacyProfile: { useNameInGreetings: false } }).useName).toBe(false);
    expect(resolvePersonalPreferences({ root: { preferredName: 'Sam' }, ui: { usePreferredName: false }, legacyProfile: { useNameInGreetings: true } }).useName).toBe(false);
    expect(resolvePersonalPreferences({ ui: { greetingEnabled: true }, legacyProfile: { greetingEnabled: false } }).enabled).toBe(false);
  });

  it('name use is opt-in, and never on without a preferred name', () => {
    expect(resolvePersonalPreferences({ root: { preferredName: 'Sam' } }).useName).toBe(false);
    expect(resolvePersonalPreferences({ ui: { usePreferredName: true } }).useName).toBe(false);
  });

  it('ignores invalid or hostile stored values', () => {
    const p = resolvePersonalPreferences({
      root: { timezone: 'Not/AZone', preferredName: 42, country: { x: 1 } },
      ui: { greetingTone: 'sarcastic', usePreferredName: 'yes' },
    });
    expect(p).toMatchObject({ preferredName: '', region: '', tone: 'warm', useName: false, language: 'en' });
    expect(p.timeZone).not.toBe('Not/AZone');
  });

  it('writes only the fields the Firestore rules allow', () => {
    const w = canonicalPreferenceWrites({ preferredName: '  Sam ', timeZone: 'Europe/London', region: 'UK', tone: 'simple', useName: true, enabled: true, language: 'en', lowEnergyMode: false });
    expect(Object.keys(w.root).sort()).toEqual(['country', 'locale', 'preferredName', 'timezone']);
    expect(Object.keys(w.ui).sort()).toEqual(['greetingEnabled', 'greetingTone', 'localePreference', 'lowEnergyMode', 'usePreferredName']);
    expect(w.root.preferredName).toBe('Sam');
    expect(w.ui.localePreference).toBe('en');
    expect(() => sanitisePersonalPreferences({ preferredName: '', timeZone: 'Mars/Base', region: '', tone: 'warm', useName: false, enabled: true, language: 'en', lowEnergyMode: false })).toThrow(/valid time zone/);
  });

  it('round-trips between the web profile and the canonical record', () => {
    const web = { preferredName: 'Lee', timeZone: 'Australia/Sydney', region: 'AU', greetingTone: 'direct', useNameInGreetings: true, greetingEnabled: false };
    expect(webProfileFieldsFrom(preferencesFromWebProfile(web))).toMatchObject({ ...web, language: 'en' });
  });

  it('language: any of the 12 codes, chosen on either platform; unknown -> English', () => {
    expect(resolvePersonalPreferences({ ui: { localePreference: 'ar' } }).language).toBe('ar');
    expect(resolvePersonalPreferences({ root: { locale: 'de' } }).language).toBe('de');
    expect(resolvePersonalPreferences({ legacyProfile: { language: 'pl' } }).language).toBe('pl');
    expect(resolvePersonalPreferences({ ui: { localePreference: 'xx' }, root: { locale: 'fr' } }).language).toBe('fr');
    expect(resolvePersonalPreferences({ ui: { localePreference: 'klingon' } }).language).toBe('en');
    const w = canonicalPreferenceWrites({ preferredName: '', timeZone: 'UTC', region: '', tone: 'warm', useName: false, enabled: true, language: 'zh' as any, lowEnergyMode: true });
    expect(w.root.locale).toBe('zh');
    expect(w.ui).toMatchObject({ localePreference: 'zh', lowEnergyMode: true });
  });
});

/**
 * One canonical personal-preference record shared by web and Expo.
 *
 * Canonical storage (already allowed by firestore.rules; no rules change):
 *   users/{uid}                 preferredName, timezone, country, locale
 *   users/{uid}/preferences/ui  greetingEnabled, usePreferredName,
 *                               greetingTone, localePreference
 * Legacy web storage, read only as a fallback so nothing needs migrating:
 *   users/{uid}/user_stats/core  profile.{preferredName, timeZone, region,
 *                               greetingTone, greetingEnabled, useNameInGreetings, language}
 *
 * Language: any of the 12 supported codes; unknown values fall back to English.
 * Consent rule: an explicit "no" anywhere is kept. Name use in greetings is
 * opt-in, so with no explicit choice the name is not used.
 */
import { deviceTimeZone, validTimeZone, type WelcomeTone } from './personal-welcome';
import { isLocaleCode, resolveLocale, type LocaleCode } from './i18n';

export interface PersonalPreferences {
  preferredName: string;
  timeZone: string;
  region: string;
  tone: WelcomeTone;
  useName: boolean;
  enabled: boolean;
  /** One of the 12 supported languages (i18n/locales.ts). */
  language: LocaleCode;
  /** Calmer screens: no confetti or pop-up celebrations. */
  lowEnergyMode: boolean;
}

type Doc = Record<string, unknown> | null | undefined;

const TONES: readonly WelcomeTone[] = ['warm', 'simple', 'direct'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isTone = (v: unknown): v is WelcomeTone => typeof v === 'string' && (TONES as readonly string[]).includes(v);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

export const defaultPersonalPreferences = (): PersonalPreferences => ({
  preferredName: '', timeZone: deviceTimeZone(), region: '', tone: 'warm', useName: false, enabled: true, language: 'en', lowEnergyMode: false,
});

export function resolvePersonalPreferences(input: { root?: Doc; ui?: Doc; legacyProfile?: Doc }): PersonalPreferences {
  const root = input.root || {};
  const ui = input.ui || {};
  const legacy = input.legacyProfile || {};
  const d = defaultPersonalPreferences();
  const zone = [str(root.timezone, 80), str(legacy.timeZone, 80)].find((z) => z && validTimeZone(z));
  const preferredName = str(root.preferredName, 60) || str(legacy.preferredName, 60);

  const uiName = bool(ui.usePreferredName);
  const legacyName = bool(legacy.useNameInGreetings);
  const useName = uiName === false || legacyName === false ? false : (uiName === true || legacyName === true);

  const uiEnabled = bool(ui.greetingEnabled);
  const legacyEnabled = bool(legacy.greetingEnabled);
  const enabled = !(uiEnabled === false || legacyEnabled === false);

  return {
    preferredName,
    timeZone: zone || d.timeZone,
    region: str(root.country, 60) || str(legacy.region, 60),
    tone: isTone(ui.greetingTone) ? ui.greetingTone : isTone(legacy.greetingTone) ? legacy.greetingTone : 'warm',
    useName: Boolean(preferredName && useName),
    enabled,
    // The ui document is the canonical choice; then the root record; then
    // the legacy web profile. Unknown codes fall back to English.
    language: [ui.localePreference, root.locale, legacy.language].find(isLocaleCode) ?? 'en',
    lowEnergyMode: ui.lowEnergyMode === true,
  };
}

/** Validates and normalises; throws a customer-readable message for a bad time zone. */
export function sanitisePersonalPreferences(value: PersonalPreferences): PersonalPreferences {
  const preferredName = str(value.preferredName, 60);
  const timeZone = str(value.timeZone, 80);
  if (!validTimeZone(timeZone)) throw new Error('Choose a valid time zone, such as Europe/London.');
  return {
    preferredName,
    timeZone,
    region: str(value.region, 60),
    tone: isTone(value.tone) ? value.tone : 'warm',
    useName: Boolean(preferredName && value.useName),
    enabled: value.enabled !== false,
    language: resolveLocale(value.language),
    lowEnergyMode: value.lowEnergyMode === true,
  };
}

/** The exact fields written to the canonical documents (matches the rules allowlists). */
export function canonicalPreferenceWrites(value: PersonalPreferences) {
  const p = sanitisePersonalPreferences(value);
  return {
    root: { preferredName: p.preferredName, timezone: p.timeZone, country: p.region, locale: p.language },
    ui: { greetingEnabled: p.enabled, usePreferredName: p.useName, greetingTone: p.tone, localePreference: p.language, lowEnergyMode: p.lowEnergyMode },
  };
}

/** Builds the canonical record from a web profile (onboarding / Settings form). */
export function preferencesFromWebProfile(profile: Doc): PersonalPreferences {
  const p = profile || {};
  const d = defaultPersonalPreferences();
  const zone = str(p.timeZone, 80);
  return {
    preferredName: str(p.preferredName, 60),
    timeZone: zone && validTimeZone(zone) ? zone : d.timeZone,
    region: str(p.region, 60),
    tone: isTone(p.greetingTone) ? p.greetingTone : 'warm',
    useName: p.useNameInGreetings === true,
    enabled: p.greetingEnabled !== false,
    language: resolveLocale(typeof p.language === 'string' ? p.language : null),
    lowEnergyMode: p.lowEnergyMode === true,
  };
}

/** Maps the canonical record back onto the web profile's field names. */
export function webProfileFieldsFrom(p: PersonalPreferences) {
  return {
    preferredName: p.preferredName, timeZone: p.timeZone, region: p.region, greetingTone: p.tone,
    useNameInGreetings: p.useName, greetingEnabled: p.enabled, language: p.language, lowEnergyMode: p.lowEnergyMode,
  };
}

// Shared translation runtime for web and Expo. No dependency, no network,
// no paid API: packs are bundled. Missing keys fall back to English, so a
// customer never sees a raw key or a blank label.
import { en, type TranslationKey } from './en';
import { DEFAULT_LOCALE, isLocaleCode, localeInfo, type LocaleCode } from './locales';
import { de } from './packs/de';
import { nl } from './packs/nl';
import { fr } from './packs/fr';
import { ar } from './packs/ar';
import { es } from './packs/es';
import { pt } from './packs/pt';
import { hi } from './packs/hi';
import { ur } from './packs/ur';
import { zh } from './packs/zh';
import { bn } from './packs/bn';
import { pl } from './packs/pl';

export { en, type TranslationKey } from './en';
export * from './locales';

export type Pack = Partial<Record<TranslationKey, string>>;
export const PACKS: Record<LocaleCode, Pack> = { en, de, nl, fr, ar, es, pt, hi, ur, zh, bn, pl };

export type Vars = Record<string, string | number>;

/**
 * Best supported locale for a stored preference or a device/browser locale
 * string such as "pt-BR" or "zh-Hans-CN". Unknown -> English.
 */
export function resolveLocale(value: string | null | undefined): LocaleCode {
  if (!value) return DEFAULT_LOCALE;
  const lower = value.toLowerCase().replace('_', '-');
  if (isLocaleCode(lower)) return lower;
  const base = lower.split('-')[0];
  return isLocaleCode(base) ? base : DEFAULT_LOCALE;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
}

/** Translate with English fallback. Unknown keys return the key (caught by tests). */
export function translate(locale: string | null | undefined, key: TranslationKey, vars?: Vars): string {
  const code = resolveLocale(locale);
  const value = PACKS[code][key] ?? en[key] ?? key;
  return interpolate(value, vars);
}

/** True when this key would be shown in English for this locale. */
export function isFallback(locale: string | null | undefined, key: TranslationKey): boolean {
  const code = resolveLocale(locale);
  return code !== 'en' && !PACKS[code][key];
}

export function textDirection(locale: string | null | undefined): 'ltr' | 'rtl' {
  return localeInfo(resolveLocale(locale)).dir;
}

/** BCP-47 tag for screen readers (html lang) and Intl formatting. */
export function intlLocale(locale: string | null | undefined): string {
  return localeInfo(resolveLocale(locale)).intl;
}

/** Plural-aware count label using CLDR plural rules for the locale. */
export function translateCount(locale: string | null | undefined, base: 'checkin.count', count: number): string {
  const safe = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  const form = new Intl.PluralRules(intlLocale(locale)).select(safe) === 'one' ? 'one' : 'other';
  return translate(locale, `${base}.${form}` as TranslationKey, { count: formatNumber(locale, safe) });
}

export function formatNumber(locale: string | null | undefined, value: number): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function formatDate(locale: string | null | undefined, date: Date, timeZone: string, style: 'medium' | 'long' = 'medium'): string {
  let zone = 'UTC';
  try { new Intl.DateTimeFormat('en-GB', { timeZone }); zone = timeZone; } catch { /* invalid zone -> UTC */ }
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: zone, dateStyle: style }).format(date);
}

/** Keys missing or empty in a pack (English has none by definition). */
export function missingKeys(code: LocaleCode): TranslationKey[] {
  const pack = PACKS[code];
  return (Object.keys(en) as TranslationKey[]).filter((k) => !pack[k] || !String(pack[k]).trim());
}

export function coverage(code: LocaleCode): { translated: number; total: number; percent: number } {
  const total = Object.keys(en).length;
  const translated = total - missingKeys(code).length;
  return { translated, total, percent: Math.round((translated / total) * 1000) / 10 };
}

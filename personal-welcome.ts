/**
 * Personal welcome, shared by web and Expo. No GPS, external API or AI calls.
 * English is the only fully reviewed language pack; unknown locales fall back
 * to English. All time calculations use an IANA zone, including DST.
 */
import {
  translate, translateCount, resolveLocale, textDirection as i18nDirection, formatDate, SUPPORTED_LOCALES,
  type LocaleCode, type TranslationKey,
} from './i18n';

export type WelcomeTone = 'warm' | 'simple' | 'direct';
export type WelcomePeriod = 'morning' | 'afternoon' | 'evening' | 'night';

/** All 12 languages; only English is reviewed (see i18n/locales.ts status). */
export const RELEASED_LANGUAGES = SUPPORTED_LOCALES;

export function resolveLanguage(locale: string | null | undefined): LocaleCode {
  return resolveLocale(locale);
}

/** Text from the shared catalogue (i18n/en.ts), English fallback. */
export function textFor(key: TranslationKey, locale?: string | null): string {
  return translate(locale, key);
}

export function textDirection(locale?: string | null): 'ltr' | 'rtl' {
  return i18nDirection(locale);
}

export function deviceLocale(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().locale || 'en'; }
  catch { return 'en'; }
}

export function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

export function validTimeZone(zone: string | null | undefined): boolean {
  if (!zone || zone.length > 80) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }); return true; }
  catch { return false; }
}

export function formatLocalDate(date: Date, timeZone: string, locale?: string | null): string {
  return formatDate(locale, date, validTimeZone(timeZone) ? timeZone : 'UTC');
}

export function checkInCountLabel(count: number, locale?: string | null): string {
  return translateCount(locale, 'checkin.count', count);
}

export function localTimeParts(date: Date, zone: string): { hour: number; day: string } {
  const valid = validTimeZone(zone) ? zone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: valid, hour: '2-digit', hourCycle: 'h23', year: 'numeric',
    month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '00';
  return { hour: Number(get('hour')), day: `${get('year')}-${get('month')}-${get('day')}` };
}

export function welcomePeriod(hour: number): WelcomePeriod {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const MESSAGES_PER_SLOT = 3;

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % length;
}

export function personalWelcome(options: {
  now: Date;
  timeZone?: string | null;
  preferredName?: string | null;
  allowName?: boolean;
  tone?: WelcomeTone;
  seed?: string;
  locale?: string | null;
}): { greeting: string; message: string; period: WelcomePeriod; language: LocaleCode } {
  const language = resolveLanguage(options.locale);
  const { hour, day } = localTimeParts(options.now, options.timeZone || deviceTimeZone());
  const period = welcomePeriod(hour);
  const tone: WelcomeTone = options.tone === 'simple' || options.tone === 'direct' ? options.tone : 'warm';
  const name = options.allowName === true ? (options.preferredName || '').trim().slice(0, 60) : '';
  const word = translate(language, `welcome.greeting.${period}` as TranslationKey);
  const greeting = name
    ? translate(language, 'welcome.greetingWithName', { greeting: word, name })
    : translate(language, 'welcome.greetingNoName', { greeting: word });
  // The index depends on day/period/tone only, so every language shows the
  // equivalent message for the same moment.
  const index = stableIndex(`${options.seed || 'welcome'}|${day}|${period}|${tone}`, MESSAGES_PER_SLOT);
  return { greeting, message: translate(language, `welcome.${tone}.${period}.${index}` as TranslationKey), period, language };
}

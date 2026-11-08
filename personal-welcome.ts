/**
 * Personal welcome, shared by web and Expo. No GPS, external API or AI calls.
 * English is the only fully reviewed language pack; unknown locales fall back
 * to English. All time calculations use an IANA zone, including DST.
 */
export type WelcomeTone = 'warm' | 'simple' | 'direct';
export type WelcomePeriod = 'morning' | 'afternoon' | 'evening' | 'night';
export type TranslationKey = 'welcome.greeting.morning' | 'welcome.greeting.afternoon' |
  'welcome.greeting.evening' | 'welcome.greeting.night' | 'welcome.privacy' |
  'welcome.checkin' | 'welcome.skip';

const ENGLISH: Record<TranslationKey, string> = {
  'welcome.greeting.morning': 'Good morning',
  'welcome.greeting.afternoon': 'Good afternoon',
  'welcome.greeting.evening': 'Good evening',
  'welcome.greeting.night': 'Hello',
  'welcome.privacy': 'Your preferences are yours to change.',
  'welcome.checkin': 'Check in',
  'welcome.skip': 'Not today',
};

export const RELEASED_LANGUAGES = [{ code: 'en', name: 'English', direction: 'ltr' }] as const;

export function resolveLanguage(locale: string | null | undefined): 'en' {
  // Future reviewed packs must be deliberately added to this resolver.
  void locale;
  return 'en';
}

export function textFor(key: TranslationKey, locale?: string | null): string {
  void resolveLanguage(locale);
  return ENGLISH[key];
}

export function textDirection(locale?: string | null): 'ltr' | 'rtl' {
  // Architecturally ready for RTL, but English is the sole released pack.
  return /^(ar|fa|he|ur)(-|$)/i.test(locale || '') ? 'rtl' : 'ltr';
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
  const zone = validTimeZone(timeZone) ? timeZone : 'UTC';
  // Only reviewed English formatting is released today; the interface can
  // safely expand after adding translated packs and locale-specific QA.
  void resolveLanguage(locale);
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, dateStyle: 'medium' }).format(date);
}

export function checkInCountLabel(count: number, locale?: string | null): string {
  void resolveLanguage(locale);
  const safeCount = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  return `${safeCount} ${new Intl.PluralRules('en-GB').select(safeCount) === 'one' ? 'check-in' : 'check-ins'}`;
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

const messages: Record<WelcomeTone, Record<WelcomePeriod, readonly string[]>> = {
  warm: {
    morning: ['A gentle start is still a start.', 'You can take today one step at a time.', 'Make space for what matters to you.'],
    afternoon: ['There is room to slow down.', 'A small pause can help.', 'You get to choose your next step.'],
    evening: ['You can leave some things for another day.', 'Rest is allowed.', 'A quieter pace is fine.'],
    night: ['No need to do more tonight.', 'You can pick this up another time.', 'Take the time you need.'],
  },
  simple: {
    morning: ['Take your time.', 'One step at a time.', 'Start where you are.'],
    afternoon: ['Pause if you need to.', 'Keep it simple.', 'Choose one thing.'],
    evening: ['Time to slow down if you wish.', 'Keep things simple.', 'You can stop here.'],
    night: ['You can rest.', 'There is no rush.', 'Come back when you are ready.'],
  },
  direct: {
    morning: ['Choose your next step.', 'Start with what matters.', 'Your pace, your choice.'],
    afternoon: ['Review your priorities.', 'Choose a useful next step.', 'Take a break if needed.'],
    evening: ['Review or pause.', 'Set things aside if needed.', 'You can finish here.'],
    night: ['No tasks required.', 'Resume another time.', 'You can stop for today.'],
  },
};

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
}): { greeting: string; message: string; period: WelcomePeriod; language: 'en' } {
  const language = resolveLanguage(options.locale);
  const { hour, day } = localTimeParts(options.now, options.timeZone || deviceTimeZone());
  const period = welcomePeriod(hour);
  const tone = options.tone && messages[options.tone] ? options.tone : 'warm';
  const name = options.allowName === true ? (options.preferredName || '').trim().slice(0, 60) : '';
  const greeting = textFor(`welcome.greeting.${period}` as TranslationKey, language) + (name ? `, ${name}` : '') + '.';
  const choices = messages[tone][period];
  return { greeting, message: choices[stableIndex(`${options.seed || 'welcome'}|${day}|${period}|${tone}`, choices.length)], period, language };
}

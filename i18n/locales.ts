// The 12 supported languages. `status` is the HONEST review state:
//   'source'        - English, the source of truth
//   'machine-draft' - generated with AI assistance, NOT reviewed by a
//                     native speaker; never present it as reviewed.
// Change a status to 'reviewed' only after a documented native-speaker
// review of the whole pack (see docs/I18N_TRANSLATION_STATUS.md).
export const SUPPORTED_LOCALES = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', intl: 'en-GB', status: 'source' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', intl: 'de-DE', status: 'machine-draft' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', dir: 'ltr', intl: 'nl-NL', status: 'machine-draft' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr', intl: 'fr-FR', status: 'machine-draft' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', intl: 'ar', status: 'machine-draft' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr', intl: 'es-ES', status: 'machine-draft' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr', intl: 'pt-PT', status: 'machine-draft' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', dir: 'ltr', intl: 'hi-IN', status: 'machine-draft' },
  { code: 'ur', nativeName: 'اردو', englishName: 'Urdu', dir: 'rtl', intl: 'ur-PK', status: 'machine-draft' },
  { code: 'zh', nativeName: '中文（简体）', englishName: 'Mandarin Chinese (Simplified)', dir: 'ltr', intl: 'zh-CN', status: 'machine-draft' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', dir: 'ltr', intl: 'bn-BD', status: 'machine-draft' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish', dir: 'ltr', intl: 'pl-PL', status: 'machine-draft' },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code'];
export const LOCALE_CODES: readonly LocaleCode[] = SUPPORTED_LOCALES.map((l) => l.code);
export const DEFAULT_LOCALE: LocaleCode = 'en';

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (LOCALE_CODES as readonly string[]).includes(value);
}

export function localeInfo(code: LocaleCode) {
  return SUPPORTED_LOCALES.find((l) => l.code === code)!;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  translate, translateCount, resolveLocale, textDirection, intlLocale, formatNumber, formatDate,
  type LocaleCode, type TranslationKey, type Vars,
} from '../../i18n';

// Device-level interface language (before sign-in, or for guests). A signed-
// in account's saved language (canonical preferences/ui) always wins.
export const UI_LOCALE_STORAGE_KEY = 'blaze_ui_locale';

export function initialDeviceLocale(): LocaleCode {
  try {
    const stored = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY);
    if (stored) return resolveLocale(stored);
  } catch { /* storage may be unavailable */ }
  return resolveLocale(typeof navigator !== 'undefined' ? navigator.language : 'en');
}

export interface I18nValue {
  locale: LocaleCode;
  dir: 'ltr' | 'rtl';
  setLocale: (locale: LocaleCode) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
  count: (count: number) => string;
  number: (value: number) => string;
  date: (date: Date, timeZone: string) => string;
}

const fallback: I18nValue = {
  locale: 'en', dir: 'ltr', setLocale: () => {},
  t: (key, vars) => translate('en', key, vars),
  count: (n) => translateCount('en', 'checkin.count', n),
  number: (v) => formatNumber('en', v),
  date: (d, z) => formatDate('en', d, z),
};

const I18nContext = createContext<I18nValue>(fallback);

/**
 * Applies the language instantly: text, <html lang> for screen readers and
 * <html dir> for right-to-left languages (Arabic, Urdu).
 */
export function I18nProvider({ locale, onLocaleChange, children }: {
  locale: LocaleCode;
  onLocaleChange: (locale: LocaleCode) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = intlLocale(locale);
    root.dir = textDirection(locale);
  }, [locale]);

  const setLocale = useCallback((next: LocaleCode) => {
    try { window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, next); } catch { /* optional */ }
    onLocaleChange(next);
  }, [onLocaleChange]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    dir: textDirection(locale),
    setLocale,
    t: (key, vars) => translate(locale, key, vars),
    count: (n) => translateCount(locale, 'checkin.count', n),
    number: (v) => formatNumber(locale, v),
    date: (d, z) => formatDate(locale, d, z),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/** Root wrapper: owns the current language; App applies the account's saved choice. */
export function I18nRoot({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<LocaleCode>(() => initialDeviceLocale());
  return <I18nProvider locale={locale} onLocaleChange={setLocale}>{children}</I18nProvider>;
}

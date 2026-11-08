// Native (Expo) language provider. Same catalogue and rules as the web app
// (/i18n), so both platforms show identical wording. No dependency added:
// the device language comes from Intl; the signed-in account's saved
// language (canonical preferences/ui) wins once it has loaded.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  translate, translateCount, resolveLocale, textDirection, intlLocale, formatDate,
  type LocaleCode, type TranslationKey, type Vars,
} from '../../../i18n';
import { useAuth } from './auth-context';
import { readPersonalProfile } from './personal-profile';

export function deviceLanguage(): LocaleCode {
  try { return resolveLocale(Intl.DateTimeFormat().resolvedOptions().locale); }
  catch { return 'en'; }
}

export interface NativeI18n {
  locale: LocaleCode;
  /** 'rtl' for Arabic/Urdu: apply as the `direction` style on containers. */
  dir: 'ltr' | 'rtl';
  /** BCP-47 tag for accessibilityLanguage on text. */
  tag: string;
  setLocale: (locale: LocaleCode) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
  count: (n: number) => string;
  date: (d: Date, zone: string) => string;
}

const build = (locale: LocaleCode, setLocale: (l: LocaleCode) => void): NativeI18n => ({
  locale,
  dir: textDirection(locale),
  tag: intlLocale(locale),
  setLocale,
  t: (key, vars) => translate(locale, key, vars),
  count: (n) => translateCount(locale, 'checkin.count', n),
  date: (d, zone) => formatDate(locale, d, zone),
});

const Ctx = createContext<NativeI18n>(build('en', () => {}));

export function NativeI18nProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocale] = useState<LocaleCode>(() => deviceLanguage());
  const uid = user && !user.isAnonymous ? user.uid : null;

  useEffect(() => {
    if (!uid) return;
    let active = true;
    readPersonalProfile(uid)
      .then((p) => { if (active) setLocale(p.language); })
      .catch(() => { /* keep the device language */ });
    return () => { active = false; };
  }, [uid]);

  const value = useMemo(() => build(locale, setLocale), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNativeI18n = () => useContext(Ctx);

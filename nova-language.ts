// Nova's reply language. The code comes ONLY from the account's own
// server-read preference (users/{uid}/preferences/ui.localePreference),
// which the Firestore rules restrict to the 12 supported codes - never from
// the request body. Anything else means no instruction (English default).
import { isLocaleCode, localeInfo } from './i18n/locales';

export function novaLanguageInstruction(code: unknown): string {
  if (!isLocaleCode(code) || code === 'en') return '';
  const l = localeInfo(code);
  return `

Language: Reply in ${l.englishName} (${l.nativeName}). Keep the same meaning, warmth and coaching rules. Keep people's names, the names "Nova" and "Blaze Break", and every phone number exactly as written. If you cannot reply reliably in ${l.englishName}, reply in clear, simple English and say so in one short sentence. Never shorten or drop safety or crisis information because of the language; if unsure of a translation, give that part in English as well.`;
}

export async function readNovaLanguage(uid: string, db: any): Promise<string> {
  try {
    const snap = await db.collection('users').doc(uid).collection('preferences').doc('ui').get();
    const code = snap.exists ? snap.data()?.localePreference : undefined;
    return isLocaleCode(code) ? code : 'en';
  } catch {
    return 'en';
  }
}

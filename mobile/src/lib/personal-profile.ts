import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, getDb } from './firebase';
import { deviceTimeZone, validTimeZone, type WelcomeTone } from '../../../personal-welcome';

export interface PersonalProfile {
  preferredName: string;
  timeZone: string;
  region: string;
  tone: WelcomeTone;
  useName: boolean;
  enabled: boolean;
  language: 'en';
}

export const emptyPersonalProfile = (): PersonalProfile => ({
  preferredName: '', timeZone: deviceTimeZone(), region: '',
  tone: 'warm', useName: false, enabled: true, language: 'en',
});

export function sanitisePersonalProfile(value: PersonalProfile): PersonalProfile {
  const name = value.preferredName.trim().slice(0, 60);
  const region = value.region.trim().slice(0, 60);
  const timeZone = value.timeZone.trim();
  if (!validTimeZone(timeZone)) throw new Error('Choose a valid time zone, such as Europe/London.');
  return {
    preferredName: name, region, timeZone,
    tone: ['warm', 'simple', 'direct'].includes(value.tone) ? value.tone : 'warm',
    useName: Boolean(name && value.useName),
    enabled: value.enabled !== false,
    language: 'en',
  };
}

export async function readPersonalProfile(uid: string): Promise<PersonalProfile> {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const db = await getDb();
  const [user, ui] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'users', uid, 'preferences', 'ui')),
  ]);
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const u = user.data() || {};
  const p = ui.data() || {};
  const defaults = emptyPersonalProfile();
  return {
    ...defaults,
    preferredName: typeof u.preferredName === 'string' ? u.preferredName : '',
    timeZone: typeof u.timezone === 'string' && validTimeZone(u.timezone) ? u.timezone : defaults.timeZone,
    region: typeof u.country === 'string' ? u.country : '',
    tone: p.greetingTone === 'simple' || p.greetingTone === 'direct' ? p.greetingTone : 'warm',
    useName: p.usePreferredName === true,
    enabled: p.greetingEnabled !== false,
  };
}

export async function savePersonalProfile(uid: string, input: PersonalProfile): Promise<void> {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const profile = sanitisePersonalProfile(input);
  const db = await getDb();
  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const stamp = new Date().toISOString();
  const fields = {
    preferredName: profile.preferredName,
    timezone: profile.timeZone,
    country: profile.region,
    locale: profile.language,
    updatedAt: stamp,
  };
  if (existing.exists()) {
    await updateDoc(userRef, fields);
  } else {
    // A fresh account may not yet have completed the auth listener's
    // ensureUserDocument; preserve createdAt when creating its first doc.
    await setDoc(userRef, { ...fields, createdAt: stamp });
  }
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  await setDoc(doc(db, 'users', uid, 'preferences', 'ui'), {
    greetingEnabled: profile.enabled,
    usePreferredName: profile.useName,
    greetingTone: profile.tone,
    localePreference: profile.language,
  }, { merge: true });
}

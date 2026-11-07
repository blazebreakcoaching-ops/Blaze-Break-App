import type { UserProfileData } from '../types';

/**
 * The previous "blaze_profile" localStorage entry was global to a browser.
 * A signed-in account must never read another account's name, preferences,
 * onboarding answers or private situational context from that shared key.
 */
export const accountProfileStorageKey = (uid: string): string =>
  `blaze_profile_v2:${encodeURIComponent(uid)}`;

export function readAccountProfile(uid?: string | null): Partial<UserProfileData> {
  if (!uid) return {};
  try {
    const raw = localStorage.getItem(accountProfileStorageKey(uid));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Partial<UserProfileData> : {};
  } catch {
    return {};
  }
}

export function writeAccountProfile(uid: string | null | undefined, profile: Partial<UserProfileData>): void {
  if (!uid) return;
  try {
    localStorage.setItem(accountProfileStorageKey(uid), JSON.stringify(profile));
  } catch {
    // Account functionality must not depend on browser storage.
  }
}

export function patchAccountProfile(uid: string | null | undefined, patch: Partial<UserProfileData>): void {
  if (!uid) return;
  writeAccountProfile(uid, { ...readAccountProfile(uid), ...patch });
}

export function clearAccountProfile(uid: string | null | undefined): void {
  if (!uid) return;
  try { localStorage.removeItem(accountProfileStorageKey(uid)); } catch { /* storage unavailable (private mode/quota): nothing to clear */ }
}

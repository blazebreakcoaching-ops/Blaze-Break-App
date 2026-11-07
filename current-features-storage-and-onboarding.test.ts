import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isSafeAuthenticatedStorageKey } from './src/lib/secure-local-storage-keys';

describe('existing user experiences: secure storage and onboarding', () => {
  it('preserves themes AND real-account private preferences without opening cross-account storage', () => {
    const source = readFileSync('src/main.tsx', 'utf8');
    expect(source).toContain("isSafeAuthenticatedStorageKey(key");
    expect(isSafeAuthenticatedStorageKey('blaze_theme_mode', 'A')).toBe(true);
    expect(isSafeAuthenticatedStorageKey('blaze_dark_mode', 'A')).toBe(true);
    expect(isSafeAuthenticatedStorageKey('blaze_profile_v2:A', 'A')).toBe(true);
    expect(isSafeAuthenticatedStorageKey('blaze_profile_v2:A', 'B')).toBe(false);
    expect(isSafeAuthenticatedStorageKey('blaze_profile', 'A')).toBe(false);
    expect(isSafeAuthenticatedStorageKey('nova_chat_history::A', 'A')).toBe(true);
    expect(isSafeAuthenticatedStorageKey('nova_chat_history::A', 'B')).toBe(false);
  });

  it("does not interrupt a new anonymous demo with an existing-users What's New modal", () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    // Only guard the changelog mount, not ordinary Nova or demo routes.
    expect(source).toMatch(/\{user && !user\.isAnonymous && \(\s*<Suspense fallback=\{null\}>\s*<WhatsNewModal/);
  });
});

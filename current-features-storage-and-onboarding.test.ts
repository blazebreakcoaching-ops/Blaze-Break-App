import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('existing user experiences: secure storage and onboarding', () => {
  it('does not silently block Light/Dark/System persistence for signed-in users', () => {
    const source = readFileSync('src/main.tsx', 'utf8');
    const allowed = source.match(/const ALLOWED_AUTHED_KEYS\s*=\s*\[([\s\S]*?)\];/)?.[1];
    expect(allowed).toBeTruthy();
    // The legacy Secure Account storage shim only allows these keys for
    // registered accounts. App theme settings are device-level, not
    // shared anonymous-onboarding state like blaze_profile.
    expect(allowed).toContain("'blaze_theme_mode'");
    expect(allowed).toContain("'blaze_dark_mode'");
    expect(allowed).not.toContain("'blaze_profile'");
    expect(source).toContain('key === allowed || key.startsWith');
  });

  it("does not interrupt a new anonymous demo with an existing-users What's New modal", () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    // Only guard the changelog mount, not ordinary Nova or demo routes.
    expect(source).toMatch(/\{user && !user\.isAnonymous && \(\s*<Suspense fallback=\{null\}>\s*<WhatsNewModal/);
  });
});

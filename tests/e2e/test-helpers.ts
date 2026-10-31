import type { Page } from '@playwright/test';

// PHASE 6D (Priority 1) - shared across the real-app spec files that
// create or render a signed-in identity with no `photoURL` (every
// anonymous demo session, and most freshly-registered accounts): without
// this, the real app's own fallback-avatar feature
// (src/lib/sync.tsx -> `https://ui-avatars.com/api/?name=...`) makes a
// genuine request to a third-party host on every such render. In a
// network-restricted CI/sandbox that request can be blocked, and under
// concurrent browser-test load it was observed contributing to
// intermittent, hard-to-reproduce failures unrelated to whatever the
// test was actually checking (Phase 6C's own delivery report documents
// this). Mocking it to a deterministic, local, 1x1 PNG removes the
// dependency from automated testing entirely, without changing the real
// production component at all - `sync.tsx` is untouched, and a real user
// still gets a real ui-avatars.com image outside of this mocked
// environment.
//
// A minimal, valid, inline PNG - never read from disk, so this carries
// no filesystem dependency either.
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export async function mockAvatarRequests(page: Page): Promise<void> {
  await page.route('https://ui-avatars.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    });
  });
}

import { test, expect, type Page, type Locator } from '@playwright/test';
import { mockAvatarRequests } from './test-helpers';

// Phase 5M (directive §2/§4/§8) - browser-level tests against the REAL,
// signed-in Blaze Break application (src/main.tsx -> App.tsx), run via
// playwright.realapp.config.ts's "realapp-desktop"/"realapp-mobile"
// projects, both pointed at a webServer with NOVA_AGENTIC_JOURNEY_ENABLED
// left unset (false) - the current real-world default. See that config's
// own header for the full emulator/auth architecture.
//
// WHAT THIS IS: a real anonymous Firebase Auth sign-in (the same one that
// already happens for any brand-new real visitor), against a local Auth
// emulator - never a mock of useAuth() or a stand-in page. The only thing
// mocked per-test is /api/nova/chat's response (directive's own "mocked
// model responses" instruction) - everything else (auth, the real
// Express routes, real Firestore, real App.tsx component tree) is genuine.

async function gotoAppAsAnonymousUser(page: Page) {
  // Phase 5M (directive §5/§6) finding: NovaFeedbackModal.tsx auto-opens
  // 3 seconds after ANY first load (its own `nova_feedback_last_shown`
  // check), on any tab, unrelated to Nova specifically - a real, if minor,
  // "inaccessible buttons" risk if its timer lands mid-interaction (it has
  // a backdrop and focus trap). Dismissible via Escape/its own close
  // button, so not a genuine defect, but suppressed here for determinism
  // the same way a real returning user who already saw it wouldn't see
  // it again for a week.
  await page.addInitScript(() => {
    localStorage.setItem('nova_feedback_last_shown', Date.now().toString());
  });
  await mockAvatarRequests(page);
  await page.goto('/');
  // auth.tsx's AuthProvider signs this brand-new visitor in anonymously
  // the moment the page loads (against the local Auth emulator, never a
  // real project) - "Prefer to look around first? View a demo" is the real, unauthenticated-looking
  // entry point real visitors use, requiring no password of any kind.
  await page.getByRole('button', { name: 'Prefer to look around first? View a demo' }).click();
  await expect(page.getByRole('button', { name: 'Nova' })).toBeVisible({ timeout: 15_000 });
}

async function openNovaTab(page: Page) {
  await page.getByRole('button', { name: 'Nova' }).click();
}

async function mockChatOnce(page: Page, body: { text: string; planTrace?: unknown[] }) {
  await page.route('**/api/nova/chat', async (route) => {
    await route.fulfill({ json: { text: body.text, planTrace: body.planTrace ?? [] } });
  }, { times: 1 });
}

// WhatsNewModal mounts for any signed-in Firebase identity (its own
// lastSeenChangelogVersion check, unrelated to Nova) and can pop up mid-test
// on a long-running test like the Report 35 viewport/theme matrix below,
// blocking clicks behind its fixed, full-screen backdrop. Dismiss it if
// it's there rather than suppress it outright (its gate is Firestore
// profile-backed, not a simple localStorage flag like NovaFeedbackModal's).
async function dismissWhatsNewModalIfOpen(page: Page) {
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.isVisible({ timeout: 500 }).catch(() => false)) {
    await gotIt.click({ timeout: 2_000 }).catch(() => {});
  }
}

// A dismiss check immediately before a click still races WhatsNewModal's
// own 3s-delayed timer: on a long-running test, the modal can pop up in
// the gap between that check and the click itself, not just before it -
// confirmed by a real failure where the click retried against the "Got
// it" backdrop for the test's full remaining budget. Mirrors
// real-app-account-continuity.spec.ts's own clickRobustly: retry the
// click, dismissing whatever actually got in the way, rather than
// guessing a wait long enough to outlast a timer outside this test's
// control.
async function clickRobustlyPastWhatsNew(page: Page, locator: Locator, attempts = 5) {
  for (let i = 0; i < attempts - 1; i++) {
    try {
      await locator.click({ timeout: 4_000 });
      return;
    } catch {
      await dismissWhatsNewModalIfOpen(page);
    }
  }
  await locator.click();
}

test.describe('Real app (directive §2): signed-in navigation and Nova', () => {
  test('the real landing page, "Prefer to look around first? View a demo", and sidebar/nav render with no horizontal overflow', async ({ page }) => {
    await gotoAppAsAnonymousUser(page);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  // Directive §3 (Flag OFF half) - the current real-world default: the
  // Nova tab must mount the already-approved, plain NovaChat, never the
  // Agentic Journey wrapper. NovaAgenticJourney always renders its own
  // StageBar (aria-label="Journey stage"); plain NovaChat never does -
  // the one structural signal that actually distinguishes the two
  // mounts, since App.tsx passes initialStep="chat" either way (both
  // start directly in the chat view, so "which screen shows first" can't
  // tell them apart).
  test('Flag OFF (default): the real Nova tab mounts plain NovaChat, not the Agentic Journey wrapper', async ({ page }) => {
    await gotoAppAsAnonymousUser(page);
    await openNovaTab(page);
    await expect(page.getByPlaceholder(/./).first()).toBeVisible();
    await expect(page.getByLabel('Journey stage')).toHaveCount(0);
  });

  test('a real signed-in anonymous user can have an ordinary conversation with Nova via the real navigation', async ({ page }) => {
    await gotoAppAsAnonymousUser(page);
    await openNovaTab(page);

    // Regression for Report 33: the real Pixel 7 viewport exposed an
    // 11.5px overlap between Nova's Send button and the viewport-fixed
    // mobile navigation. Check genuine rendered geometry before sending,
    // rather than force-clicking through the overlapping navigation.
    if ((page.viewportSize()?.width ?? 1024) < 768) {
      const sendButton = page.getByRole('button', { name: 'Send message' });
      const mobileNav = page.getByTestId('mobile-bottom-nav');
      await expect(mobileNav).toBeVisible();
      await expect.poll(async () => {
        const [sendRect, navRect] = await Promise.all([
          sendButton.boundingBox(),
          mobileNav.boundingBox(),
        ]);
        if (!sendRect || !navRect) return -1;
        return navRect.y - (sendRect.y + sendRect.height);
      }, { timeout: 5_000 }).toBeGreaterThanOrEqual(8);
    }

    await mockChatOnce(page, { text: 'Thanks for sharing that - tell me more.' });
    await page.getByPlaceholder(/./).first().fill('I feel stretched thin this week.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Thanks for sharing that - tell me more.')).toBeVisible();
  });

  // Directive §4's named journey, driven through the REAL App.tsx tab
  // system (safeSetActiveTab), not a synthetic onNavigate stand-in - the
  // one thing the dev-preview harness used in earlier phases could never
  // prove. Boundary Architect lives on the "communicate" tab.
  test('suggest_feature(communicate) opens Boundary Architect via the real tab system, and the real nav returns to Nova with the conversation intact', async ({ page }) => {
    await gotoAppAsAnonymousUser(page);
    await openNovaTab(page);
    await mockChatOnce(page, {
      text: 'Want to try Boundary Architect?',
      planTrace: [{ tool: 'suggest_feature', result: { suggested: true, featureId: 'communicate', label: 'Boundary Architect', reason: 'User described needing to say no without feeling guilty.' } }],
    });
    await page.getByPlaceholder(/./).first().fill('I keep saying yes to things I do not have capacity for.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText('Start Boundary Architect?')).toBeVisible();
    await page.getByRole('button', { name: 'Open Tool' }).click();

    // The real App.tsx tab system actually switched - this is the real
    // "communicate" tab's own content, not a stand-in.
    await expect(page.getByRole('button', { name: 'Communicate' })).toHaveAttribute('aria-current', 'page');

    // Return to Nova via the real nav (not a synthetic ReturnToNovaLink
    // stand-in call) and confirm the conversation is still there.
    await openNovaTab(page);
    await expect(page.getByText('I keep saying yes to things I do not have capacity for.')).toBeVisible();
  });

  // Directive §4's "a dismissed offer does not repeatedly interrupt the
  // user" / Journey D, through the real app.
  test('declining a suggest_feature offer stops it from repeating on the very next turn', async ({ page }) => {
    await gotoAppAsAnonymousUser(page);
    await openNovaTab(page);
    await mockChatOnce(page, {
      text: 'Want to try Reset Studio?',
      planTrace: [{ tool: 'suggest_feature', result: { suggested: true, featureId: 'reset', label: 'Reset Studio', reason: 'User described feeling scattered and unable to focus.' } }],
    });
    await page.getByPlaceholder(/./).first().fill('I cannot focus on anything right now.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Start Reset Studio?')).toBeVisible();

    await page.getByRole('button', { name: 'Ignore' }).click();
    await expect(page.getByText('Start Reset Studio?')).not.toBeVisible();

    await mockChatOnce(page, {
      text: 'Want to try Reset Studio?',
      planTrace: [{ tool: 'suggest_feature', result: { suggested: true, featureId: 'reset', label: 'Reset Studio', reason: 'User described feeling scattered and unable to focus.' } }],
    });
    await page.getByPlaceholder(/./).first().fill('Still cannot focus.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Still cannot focus.')).toBeVisible();
    await expect(page.getByText('Start Reset Studio?')).not.toBeVisible();
  });

  // Directive §4's "the previous conversation remains accessible" - a
  // REAL browser reload, not a component remount, for a real
  // (anonymous) signed-in account. nova_chat_history is plain
  // localStorage, untouched by src/main.tsx's "Secure Account mode"
  // guard for an anonymous session (that guard only activates once
  // window.__ACTIVE_USER_EMAIL__ is a real email - see the next test).
  //
  // A real reload correctly lands back on the marketing landing page
  // first (App.tsx's own `flow` state is in-memory only, and this
  // never-onboarded demo session has no saved profile.fullName to
  // auto-skip it with - see App.tsx's own flowRef effect) - that is
  // real, intentional behaviour for a stranger reloading a tab with
  // nothing identifying saved, not a defect. "Prefer to look around first? View a demo" once
  // more is the real path back in; the conversation itself survives
  // underneath that, in localStorage, independent of `flow`.
  test('a real page reload preserves a real anonymous account\'s Nova conversation', async ({ page }) => {
    await gotoAppAsAnonymousUser(page);
    await openNovaTab(page);
    await mockChatOnce(page, { text: 'Got it, noted.' });
    await page.getByPlaceholder(/./).first().fill('Remember this exact sentence please.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Got it, noted.')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Prefer to look around first? View a demo' }).click();
    await expect(page.getByRole('button', { name: 'Nova' })).toBeVisible({ timeout: 15_000 });
    await openNovaTab(page);
    await expect(page.getByText('Remember this exact sentence please.')).toBeVisible();
    await expect(page.getByText('Got it, noted.')).toBeVisible();
  });

  // Directive §1/§5 defect found by this phase's own real-app testing:
  // src/main.tsx's "Secure Account mode" localStorage guard (added to
  // stop a shared-device demo profile leaking into a newly-signed-in
  // real account) was blocking Nova's OWN chat history/ratings/feedback/
  // voice-preference keys too, with no Firestore fallback anywhere to
  // catch them - a real signed-in account's Nova conversation was
  // silently unrecoverable on every single page load. Fixed this phase
  // by adding those five Nova-specific keys to ALLOWED_AUTHED_KEYS (see
  // main.tsx's own comment). This test drives the REAL interceptor code
  // in the real browser, simulating the real trigger point
  // (window.__ACTIVE_USER_EMAIL__ becoming a real email, exactly what
  // auth.tsx sets the instant a real, non-anonymous account is detected)
  // rather than completing this app's full real email-signup + onboarding
  // UI flow, which is a separate, larger undertaking documented in this
  // phase's own delivery report.
  test('the real "Secure Account mode" localStorage guard no longer discards Nova chat history for a real signed-in account', async ({ page }) => {
    await gotoAppAsAnonymousUser(page);
    await openNovaTab(page);
    await mockChatOnce(page, { text: 'Noted for a real account.' });
    await page.getByPlaceholder(/./).first().fill('A real accounts message.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Noted for a real account.')).toBeVisible();

    // Simulate the exact real trigger point: auth.tsx sets this the
    // instant a real (non-anonymous) account's onAuthStateChanged fires.
    await page.evaluate(() => { (window as any).__ACTIVE_USER_EMAIL__ = 'real-account-test@example.com'; });

    // The real interceptor must still let a NEW nova_chat_history write
    // through (the bug: it silently dropped this before this phase's fix).
    const writeSucceeded = await page.evaluate(() => {
      const probe = JSON.stringify([{ role: 'model', parts: [{ text: 'probe-after-real-account' }] }]);
      localStorage.setItem('nova_chat_history', probe);
      return localStorage.getItem('nova_chat_history') === probe;
    });
    expect(writeSucceeded).toBe(true);

    // And a genuinely unrelated, still-blocked key (blaze_profile is far
    // broader than Nova and deliberately NOT unblocked this phase - see
    // the delivery report's own scoping note) must still be guarded,
    // proving this fix is narrow, not a disabling of Secure Account mode.
    const unrelatedKeyStillBlocked = await page.evaluate(() => {
      localStorage.setItem('blaze_profile', '{"probe":true}');
      return localStorage.getItem('blaze_profile');
    });
    expect(unrelatedKeyStillBlocked).toBeNull();
  });

  // CTO Report 35 - replaces the Report 33/34 static rem reserve with a
  // measured, bounded-parent layout (see src/App.tsx's
  // recomputeNovaShellMetrics and src/index.css's .ember-nova-shell rules).
  // This exercises the full required matrix in one real, signed-in session:
  // every directive viewport, both themes, real typing/scroll/send/receive,
  // and - critically - that the Send button is never silently obstructed by
  // the fixed mobile nav at any of them, including the two genuinely
  // cramped ones (320x568, 375x600) where the header and demo-account
  // banner alone can legitimately exceed the space above the nav even with
  // the message log collapsed to nothing. On those, reaching the composer
  // takes a scroll within the Nova shell itself - never behind the fixed
  // nav, which is what made it unclickable before this fix.
  const REQUIRED_VIEWPORTS: { width: number; height: number }[] = [
    { width: 320, height: 568 },
    { width: 375, height: 600 },
    { width: 390, height: 844 },
    { width: 412, height: 839 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ];

  test('the Nova composer is reachable, typeable and sendable at every directive viewport and theme (Report 35)', async ({ page }) => {
    // 12 real viewport x theme combinations, each with a real network
    // round-trip and UI settle wait, genuinely exceed the config's default
    // 30s single-assertion-style budget.
    test.setTimeout(120_000);
    await gotoAppAsAnonymousUser(page);
    await openNovaTab(page);

    for (const viewport of REQUIRED_VIEWPORTS) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await test.step(`${viewport.width}x${viewport.height} (${colorScheme})`, async () => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme });
          await dismissWhatsNewModalIfOpen(page);
          // Let the ResizeObserver/onAnimationComplete-driven shell-height
          // measurement (src/App.tsx) settle after the resize before
          // asserting geometry against it.
          await page.waitForTimeout(150);

          const sendButton = page.getByRole('button', { name: 'Send message' });
          await expect(sendButton).toBeVisible({ timeout: 10_000 });

          const isMobile = viewport.width < 768;
          if (isMobile) {
            const mobileNav = page.getByTestId('mobile-bottom-nav');
            await expect(mobileNav).toBeVisible();
            // On the two most cramped viewports the header + demo-account
            // banner alone can exceed the space above the nav even with
            // the message log collapsed - .ember-nova-shell is then
            // genuinely scrollable (by design, see src/index.css), and
            // Playwright's scrollIntoViewIfNeeded() only scrolls far
            // enough for partial visibility, not to the shell's true max.
            // Scroll the shell itself to its real end, matching what a
            // real user reaching for the composer on a screen this small
            // would do.
            await page.evaluate(() => {
              const shell = document.querySelector('.ember-nova-shell');
              if (shell) shell.scrollTop = shell.scrollHeight;
            });
            await expect.poll(async () => {
              const [sendRect, navRect] = await Promise.all([
                sendButton.boundingBox(),
                mobileNav.boundingBox(),
              ]);
              if (!sendRect || !navRect) return -1;
              return navRect.y - (sendRect.y + sendRect.height);
            }, { timeout: 5_000 }).toBeGreaterThanOrEqual(8);
          }

          const replyText = `Reply for ${viewport.width}x${viewport.height} ${colorScheme}`;
          await mockChatOnce(page, { text: replyText });
          const input = page.getByPlaceholder(/./).first();
          await input.scrollIntoViewIfNeeded();
          await input.fill(`Testing ${viewport.width}x${viewport.height} ${colorScheme}`);
          await dismissWhatsNewModalIfOpen(page);
          await clickRobustlyPastWhatsNew(page, sendButton);
          await expect(page.getByText(replyText)).toBeVisible({ timeout: 10_000 });
        });
      }
    }
  });
});

import { test, expect, type Page } from '@playwright/test';

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
  await page.goto('/');
  // auth.tsx's AuthProvider signs this brand-new visitor in anonymously
  // the moment the page loads (against the local Auth emulator, never a
  // real project) - "See a live demo" is the real, unauthenticated-looking
  // entry point real visitors use, requiring no password of any kind.
  await page.getByRole('button', { name: 'See a live demo' }).click();
  await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 15_000 });
}

async function openNovaTab(page: Page) {
  await page.getByRole('button', { name: 'Nova Coach' }).click();
}

async function mockChatOnce(page: Page, body: { text: string; planTrace?: unknown[] }) {
  await page.route('**/api/nova/chat', async (route) => {
    await route.fulfill({ json: { text: body.text, planTrace: body.planTrace ?? [] } });
  }, { times: 1 });
}

test.describe('Real app (directive §2): signed-in navigation and Nova', () => {
  test('the real landing page, "See a live demo", and sidebar/nav render with no horizontal overflow', async ({ page }) => {
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
  // nothing identifying saved, not a defect. "See a live demo" once
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
    await page.getByRole('button', { name: 'See a live demo' }).click();
    await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 15_000 });
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
});

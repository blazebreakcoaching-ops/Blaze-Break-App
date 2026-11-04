import { test, expect, type Page } from '@playwright/test';
import { mockAvatarRequests } from './test-helpers';

// Real-app coverage for the advanced Nova Agentic Journey, driven through
// the REAL App.tsx against the "realapp-flag-on" webServer
// (NOVA_AGENTIC_JOURNEY_ENABLED=true, real Firestore+Auth emulators,
// playwright.realapp.config.ts). This closes the specific gap the prior
// dev-preview-only suites (nhei-phase5-journey.spec.ts,
// calendar-protection.spec.ts) could not: those exercise the real
// NovaAgenticJourney component in a real browser, but every /api/** call
// is answered by page.route() mocks. Here, only /api/nova/chat is mocked
// (no GEMINI_API_KEY is configured in this environment, and a live model
// call is out of scope regardless) - Invisible Load, Proactive
// Suggestions, Calendar Protection and Task Deferral all hit the REAL
// Express routes, the real authenticateFirebaseUser middleware, and (for
// Calendar Protection/Task Deferral) the real execute path, which is
// safe to exercise for real because CALENDAR_PROTECTION_EXECUTION_ENABLED
// is a hardcoded `false` source constant and Task Deferral has no real
// connector implementation at all - both return their genuine "nothing
// was actually sent" response, not a hand-crafted one.
//
// NOT COVERED HERE: Before Words. App.tsx mounts NovaAgenticJourney with
// `initialStep="chat"` (see App.tsx's own NovaAgenticJourney usage), and
// nothing in the real app's navigation ever calls goTo('entry') or
// goTo('before_words') - those steps are reachable only via the dev-only
// preview page's standalone "Integrated Agentic Nova Journey" section
// (nhei-phase5-journey.spec.ts), which mounts the component with no
// initialStep override. This is a genuine real-app integration gap, not
// a test gap - recorded in this phase's own report rather than papered
// over with a test that forces a step no real user path can reach.

async function dismissAnyOpenModal(page: Page) {
  // Same real, unmocked WhatsNewModal/NovaFeedbackModal this environment's
  // own real-app-account-continuity.spec.ts already found and handles
  // (see that file's own comment): a brand-new signed-in identity against
  // the real Auth emulator can pop either dialog at an unpredictable
  // point, and its z-[100] backdrop genuinely intercepts clicks underneath
  // it - a real user would see and dismiss it too. This phase's own first
  // attempt at this file skipped that handling and got exactly this: a
  // Calendar Protection run blocked mid-sequence with a 30s timeout and
  // "subtree intercepts pointer events" on the sign-out click, both
  // traced to this same dialog in the saved error-context snapshots.
  const simpleButtons = ['Close feedback dialog', "Close what's new dialog", 'Got it'];
  for (const name of simpleButtons) {
    const loc = page.getByRole('button', { name });
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ force: true, timeout: 2_000 }).catch(() => {});
    }
  }
}

async function clickRobustly(page: Page, locator: ReturnType<Page['getByRole']>, attempts = 5) {
  for (let i = 0; i < attempts - 1; i++) {
    try {
      await locator.click({ timeout: 4_000 });
      return;
    } catch {
      await dismissAnyOpenModal(page);
    }
  }
  await locator.click();
}

async function gotoFlagOnApp(page: Page) {
  await mockAvatarRequests(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'See a live demo' }).click();
  await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 15_000 });
  await dismissAnyOpenModal(page);
}

async function openNovaTab(page: Page) {
  await clickRobustly(page, page.getByRole('button', { name: 'Nova Coach' }));
}

async function mockChatOnce(page: Page, body: { text: string; planTrace?: unknown[] }) {
  await page.route('**/api/nova/chat', async (route) => {
    await route.fulfill({ json: { text: body.text, planTrace: body.planTrace ?? [] } });
  }, { times: 1 });
}

async function openInvisibleLoadViaPracticalAssistance(page: Page, userText: string) {
  await mockChatOnce(page, {
    text: 'Want help getting this off your plate?',
    planTrace: [{ tool: 'offer_practical_assistance', result: { offered: true, reason: userText } }],
  });
  await page.getByPlaceholder(/./).first().fill(userText);
  await clickRobustly(page, page.getByRole('button', { name: 'Send message' }));
  await clickRobustly(page, page.getByRole('button', { name: /review what's on my plate/i }));
  await expect(page.getByLabel('Describe an obligation, commitment, or friction')).toBeVisible();
}

test.describe('Real app (flag ON): advanced journey against real routes and emulators', () => {
  test('Before Words is accessible from the normal Nova tab and remains skippable', async ({ page }) => {
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    await clickRobustly(page, page.getByRole('button', { name: /start with before words \(optional\)/i }));
    await expect(page.getByRole('heading', { name: /before words/i })).toBeVisible();
    await clickRobustly(page, page.getByRole('button', { name: /start whenever you're ready/i }));
    await clickRobustly(page, page.getByRole('button', { name: /i'd rather not write anything right now/i }));
    // The skip ending should return to ordinary Nova chat without
    // requiring the person to enter or retain any personal text.
    await expect(page.getByRole('button', { name: /start with before words \(optional\)/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
  });

  test('Invisible Load -> Calendar Protection: granted action permission prepares and approves without analytics signals, never writes externally', async ({ page }) => {
    // Proposal preparation is not dependent on the unrelated calendar
    // analytics signal. Consent for external actions is still explicit;
    // actual connector execution is hard-disabled.
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    await openInvisibleLoadViaPracticalAssistance(page, 'I am so behind on the quarterly board deck.');

    await page.getByLabel('Describe an obligation, commitment, or friction').fill('Finish the quarterly board deck');
    await clickRobustly(page, page.getByRole('button', { name: /^add$/i }));
    await clickRobustly(page, page.getByRole('button', { name: /get help with this/i }));
    await clickRobustly(page, page.getByRole('button', { name: /^protect time for it$/i }));

    await expect(page.getByPlaceholder('What should this protected time be called?')).toHaveValue(/Finish the quarterly board deck/);
    const grant = page.getByRole('button', { name: /^grant$/i });
    await expect(grant).toBeVisible();
    await clickRobustly(page, grant);
    await expect(page.getByText('Granted', { exact: true })).toBeVisible();
    await page.getByLabel(/start time/i).fill('2026-03-02T14:00');
    await page.getByLabel(/end time/i).fill('2026-03-02T14:30');
    await clickRobustly(page, page.getByRole('button', { name: /prepare this proposal/i }));

    await expect(page.getByRole('button', { name: /show for approval/i })).toBeVisible();
    await clickRobustly(page, page.getByRole('button', { name: /show for approval/i }));
    await clickRobustly(page, page.getByRole('button', { name: /approve exactly this/i }));
    await clickRobustly(page, page.getByRole('button', { name: /try to apply this/i }));
    await expect(page.getByText(/nothing was actually sent to your calendar/i)).toBeVisible();
  });

  test('Proactive Suggestions: the real server honestly withholds a Calendar Protection suggestion until calendar action permission is actually granted', async ({ page }) => {
    // POST /api/nova/proactive-suggestions is real, unmocked, and only
    // ever offers calendar_protection when the caller's REAL, Firestore-
    // backed calendar action permission is granted (server.ts reads
    // getCalendarActionPermission(db, uid) itself, never trusts the
    // client) - a brand-new anonymous identity has never granted this,
    // so "nothing to suggest" is the one honest response, not a bug.
    // This is exactly the server-side authorisation gate directive §2
    // asks this phase to verify, proven against the real route rather
    // than assumed from the dev-preview suite's mocked permission state.
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    await openInvisibleLoadViaPracticalAssistance(page, 'I am so behind on the quarterly board deck.');

    await clickRobustly(page, page.getByRole('button', { name: /See what Nova might proactively suggest/i }));
    await page.getByLabel(/obligation or goal for proactive suggestions/i).fill('Finish the quarterly board deck');
    await clickRobustly(page, page.getByRole('button', { name: /See what Nova can suggest/i }));
    await expect(page.getByText(/nothing to suggest right now/i)).toBeVisible();
    await expect(page.getByText(/you could protect a block of time/i)).toHaveCount(0);

    // Granting real calendar action permission through the real Calendar
    // Protection screen's own "Grant" control, then asking again, proves
    // the gate is live in both directions - not merely "always off". The
    // item must actually exist first: "Get help with this" is rendered
    // per Invisible Load item, not unconditionally.
    await clickRobustly(page, page.getByRole('button', { name: /back to what's on your plate/i }));
    await page.getByLabel('Describe an obligation, commitment, or friction').fill('Finish the quarterly board deck');
    await clickRobustly(page, page.getByRole('button', { name: /^add$/i }));
    await clickRobustly(page, page.getByRole('button', { name: /get help with this/i }));
    await clickRobustly(page, page.getByRole('button', { name: /^protect time for it$/i }));
    const grantButton = page.getByRole('button', { name: /^grant$/i });
    if (await grantButton.isVisible().catch(() => false)) {
      await clickRobustly(page, grantButton);
    }
    await clickRobustly(page, page.getByRole('button', { name: /something else is on your plate too/i }));
    await clickRobustly(page, page.getByRole('button', { name: /See what Nova might proactively suggest/i }));
    await page.getByLabel(/obligation or goal for proactive suggestions/i).fill('Finish the quarterly board deck');
    await clickRobustly(page, page.getByRole('button', { name: /See what Nova can suggest/i }));
    await expect(page.getByText(/you could protect a block of time/i)).toBeVisible();
  });

  test('Invisible Load -> Task Deferral: real routes, review/approve, honest simulation-only outcome', async ({ page }) => {
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    await openInvisibleLoadViaPracticalAssistance(page, 'I need to push back my deadline for the vendor review.');

    await page.getByLabel('Describe an obligation, commitment, or friction').fill('Finish the vendor review');
    await clickRobustly(page, page.getByRole('button', { name: /^add$/i }));
    await clickRobustly(page, page.getByRole('button', { name: /get help with this/i }));
    await clickRobustly(page, page.getByRole('button', { name: /defer or reprioritise it/i }));

    await expect(page.getByLabel(/task description/i)).toHaveValue(/Finish the vendor review/);
    await clickRobustly(page, page.getByRole('button', { name: /tell nova about this task/i }));
    await expect(page.getByText(/do you control when this is due/i)).toBeVisible();
    const deadlineGroup = page.getByText(/do you control when this is due/i).locator('xpath=following-sibling::div[1]');
    await clickRobustly(page, deadlineGroup.getByRole('button', { name: /^yes$/i }));
    const ownershipGroup = page.getByText(/is this task yours alone to move/i).locator('xpath=following-sibling::div[1]');
    await clickRobustly(page, ownershipGroup.getByRole('button', { name: /^yes$/i }));
    await clickRobustly(page, page.getByRole('button', { name: /^continue$/i }));

    await page.getByLabel(/proposed new due date/i).fill('next Friday');
    await page.getByPlaceholder(/why \(or why not\)/i).fill('Nobody is blocked on this right now.');
    await clickRobustly(page, page.getByRole('button', { name: /prepare this proposal/i }));
    await clickRobustly(page, page.getByRole('button', { name: /show for approval/i }));
    await clickRobustly(page, page.getByRole('button', { name: /approve exactly this/i }));
    await clickRobustly(page, page.getByRole('button', { name: /run the simulation/i }));

    // Real server response from the permanently mock-only connector.
    await expect(page.getByText(/no real asana, monday, or jira task was modified/i)).toBeVisible();
  });

  test('conversation continuity: the agentic journey chat survives a real browser reload', async ({ page }) => {
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    await mockChatOnce(page, { text: 'Got it, noted for the agentic journey.' });
    await page.getByPlaceholder(/./).first().fill('Remember this exact sentence in the agentic journey.');
    await clickRobustly(page, page.getByRole('button', { name: 'Send message' }));
    await expect(page.getByText('Got it, noted for the agentic journey.')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'See a live demo' }).click();
    await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 15_000 });
    await dismissAnyOpenModal(page);
    await openNovaTab(page);
    await expect(page.getByText('Remember this exact sentence in the agentic journey.')).toBeVisible();
    await expect(page.getByText('Got it, noted for the agentic journey.')).toBeVisible();
  });

  test('an unauthenticated request to the real journey-config route is rejected, never defaults to enabled', async ({ page }) => {
    // Direct server-route check, no sign-in: confirms the real
    // authenticateFirebaseUser gate on /api/nova/journey-config itself,
    // independent of the client hook's own fail-closed default. A 401
    // with no agenticJourneyEnabled field is the only honest response -
    // this route must never hand an unauthenticated caller the flag value.
    const res = await page.request.get('/api/nova/journey-config');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).not.toHaveProperty('agenticJourneyEnabled');
  });

  test('sign-out then a fresh identity on the same flag-on server: a real session resumes, the journey re-enables, and nothing leaks from the old identity', async ({ page }) => {
    // ROOT CAUSE, found by tracing Firebase auth events and component
    // mounting (Report 21's open finding): "See a live demo" (App.tsx's
    // onViewDemo) only ever called setFlow("app") - a local view-state
    // flip, never a Firebase call. The automatic anonymous sign-in that
    // gives a brand-new visitor a session lives entirely in auth.tsx's
    // onAuthStateChanged effect, which deliberately skips re-running it
    // right after an explicit sign-out (logOut()'s explicitSignOutRef) -
    // on purpose, so a person who just signed out lands on a genuinely
    // signed-out page instead of an instant, confusing new guest session.
    // But nothing else ever re-triggered it afterwards either: clicking
    // "See a live demo" again left `flow` as "app" with `auth.currentUser`
    // still null for the rest of the tab's life. App.tsx's own
    // `flow === "app" && !user` branch then rendered the OmniNova
    // floating-widget fallback instead of the real signed-in Nova tab -
    // which is why a chat-shaped UI appeared to work while
    // useNovaAgenticJourneyEnabled() never got a user to fetch its config
    // for. Fixed by giving AuthProvider a `continueAsGuest()` that
    // establishes a session (idempotent if one already exists) and
    // having onViewDemo await it before flipping `flow` - see auth.tsx
    // and App.tsx's own comments on continueAsGuest.
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    // First identity: enable the journey, add an Invisible Load item.
    // A generous timeout here (not the default 5s), matching the hook's
    // own real async fetch-after-sign-in - see useNovaAgenticJourneyEnabled.ts.
    await expect(page.getByLabel('Journey stage')).toBeVisible({ timeout: 15_000 });
    await openInvisibleLoadViaPracticalAssistance(page, 'First identity: behind on the Q3 retro.');
    await page.getByLabel('Describe an obligation, commitment, or friction').fill('First identity private item');
    await clickRobustly(page, page.getByRole('button', { name: /^add$/i }));
    await expect(page.getByText('First identity private item')).toBeVisible();

    // Real sign-out via Settings - the same path real-app-account-
    // continuity.spec.ts uses, not a synthetic logOut() call.
    await clickRobustly(page, page.getByRole('button', { name: /settings/i }).first());
    await clickRobustly(page, page.getByRole('button', { name: /sign out/i }));
    await expect(page.getByRole('button', { name: 'See a live demo' })).toBeVisible({ timeout: 15_000 });

    // A fresh anonymous identity on the SAME flag-on server: a real
    // Firebase session must now exist (continueAsGuest), its own fetch
    // must independently re-enable the journey, and it must start on a
    // clean Invisible Load with no trace of the first identity's item.
    await clickRobustly(page, page.getByRole('button', { name: 'See a live demo' }));
    await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 15_000 });
    await dismissAnyOpenModal(page);
    await openNovaTab(page);
    await expect(page.getByLabel('Journey stage')).toBeVisible({ timeout: 15_000 });
    await openInvisibleLoadViaPracticalAssistance(page, 'Second identity: a completely different message.');
    await expect(page.getByText('First identity private item')).toHaveCount(0);
  });

  test('memory consent: the real "Behavioural Learning" toggle in Settings reflects a genuine, persisted choice', async ({ page }) => {
    // SettingsModal.tsx's own switch (aria-label="Behavioural Learning"),
    // backed by profile.letNovaLearn -> setNovaMemoryConsent (App.tsx) -
    // the real consent boundary for Nova's memory tools
    // (remember_about_user/search_nova_memories), independent of the
    // Agentic Journey flag. Toggling it, closing, and reopening Settings
    // proves the choice is genuinely held, not just a visual flip that
    // reverts the moment the modal remounts.
    await gotoFlagOnApp(page);
    await clickRobustly(page, page.getByRole('button', { name: /settings/i }).first());
    // The toggle lives under Settings' own "Consent & Privacy" tab
    // (SettingsModal.tsx's activeTab==='consent' panel) - "Profile" is
    // the default tab, so this click is required, not cosmetic.
    await clickRobustly(page, page.getByRole('tab', { name: /consent (&|and) privacy/i }));
    const toggle = page.getByRole('switch', { name: 'Behavioural Learning' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await clickRobustly(page, toggle);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await page.keyboard.press('Escape');
    await clickRobustly(page, page.getByRole('button', { name: /settings/i }).first());
    await clickRobustly(page, page.getByRole('tab', { name: /consent (&|and) privacy/i }));
    await expect(page.getByRole('switch', { name: 'Behavioural Learning' })).toHaveAttribute('aria-checked', 'false');
  });
});

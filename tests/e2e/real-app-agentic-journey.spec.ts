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

async function gotoFlagOnApp(page: Page) {
  await mockAvatarRequests(page);
  await page.goto('/');
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

async function openInvisibleLoadViaPracticalAssistance(page: Page, userText: string) {
  await mockChatOnce(page, {
    text: 'Want help getting this off your plate?',
    planTrace: [{ tool: 'offer_practical_assistance', result: { offered: true, reason: userText } }],
  });
  await page.getByPlaceholder(/./).first().fill(userText);
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: /review what's on my plate/i }).click();
  await expect(page.getByLabel('Describe an obligation, commitment, or friction')).toBeVisible();
}

test.describe('Real app (flag ON): advanced journey against real routes and emulators', () => {
  test('Invisible Load -> Proactive Suggestions -> Calendar Protection: real routes, review/approve, honest no-write outcome', async ({ page }) => {
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    await openInvisibleLoadViaPracticalAssistance(page, 'I am so behind on the quarterly board deck.');

    // Real POST /api/nova/proactive-suggestions - not mocked.
    await page.getByRole('button', { name: /See what Nova might proactively suggest/i }).click();
    await page.getByLabel(/obligation or goal for proactive suggestions/i).fill('Finish the quarterly board deck');
    await page.getByRole('button', { name: /See what Nova can suggest/i }).click();
    await expect(page.getByText(/you could protect a block of time/i)).toBeVisible();
    await page.getByRole('button', { name: /^use this$/i }).click();

    // Real Calendar Protection routes: propose -> present -> approve -> execute.
    await expect(page.getByPlaceholder('What should this protected time be called?')).toHaveValue(/Finish the quarterly board deck/);
    await page.getByLabel(/start time/i).fill('2026-03-02T14:00');
    await page.getByLabel(/end time/i).fill('2026-03-02T14:30');
    await page.getByRole('button', { name: /prepare this proposal/i }).click();
    await page.getByRole('button', { name: /show for approval/i }).click();
    await page.getByRole('button', { name: /approve exactly this/i }).click();
    await page.getByRole('button', { name: /try to apply this/i }).click();

    // Real server response (execution gate hardcoded off) - never mocked.
    await expect(page.getByText(/nothing was actually sent to your calendar/i)).toBeVisible();
  });

  test('Invisible Load -> Task Deferral: real routes, review/approve, honest simulation-only outcome', async ({ page }) => {
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    await openInvisibleLoadViaPracticalAssistance(page, 'I need to push back my deadline for the vendor review.');

    await page.getByLabel('Describe an obligation, commitment, or friction').fill('Finish the vendor review');
    await page.getByRole('button', { name: /^add$/i }).click();
    await page.getByRole('button', { name: /get help with this/i }).click();
    await page.getByRole('button', { name: /defer or reprioritise it/i }).click();

    await expect(page.getByLabel(/task description/i)).toHaveValue(/Finish the vendor review/);
    await page.getByRole('button', { name: /tell nova about this task/i }).click();
    await expect(page.getByText(/do you control when this is due/i)).toBeVisible();
    const deadlineGroup = page.getByText(/do you control when this is due/i).locator('xpath=following-sibling::div[1]');
    await deadlineGroup.getByRole('button', { name: /^yes$/i }).click();
    const ownershipGroup = page.getByText(/is this task yours alone to move/i).locator('xpath=following-sibling::div[1]');
    await ownershipGroup.getByRole('button', { name: /^yes$/i }).click();
    await page.getByRole('button', { name: /^continue$/i }).click();

    await page.getByLabel(/proposed new due date/i).fill('next Friday');
    await page.getByPlaceholder(/why \(or why not\)/i).fill('Nobody is blocked on this right now.');
    await page.getByRole('button', { name: /prepare this proposal/i }).click();
    await page.getByRole('button', { name: /show for approval/i }).click();
    await page.getByRole('button', { name: /approve exactly this/i }).click();
    await page.getByRole('button', { name: /run the simulation/i }).click();

    // Real server response from the permanently mock-only connector.
    await expect(page.getByText(/no real asana, monday, or jira task was modified/i)).toBeVisible();
  });

  test('conversation continuity: the agentic journey chat survives a real browser reload', async ({ page }) => {
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    await mockChatOnce(page, { text: 'Got it, noted for the agentic journey.' });
    await page.getByPlaceholder(/./).first().fill('Remember this exact sentence in the agentic journey.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Got it, noted for the agentic journey.')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'See a live demo' }).click();
    await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 15_000 });
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

  test('sign-out then a fresh identity on the same flag-on server: the new account gets its own journey state, never a leftover from the old one', async ({ page }) => {
    await gotoFlagOnApp(page);
    await openNovaTab(page);
    // First identity: enable the journey, add an Invisible Load item.
    await expect(page.getByLabel('Journey stage')).toBeVisible();
    await openInvisibleLoadViaPracticalAssistance(page, 'First identity: behind on the Q3 retro.');
    await page.getByLabel('Describe an obligation, commitment, or friction').fill('First identity private item');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByText('First identity private item')).toBeVisible();

    // Real sign-out via Settings - the same path real-app-account-
    // continuity.spec.ts uses, not a synthetic logOut() call.
    await page.getByRole('button', { name: /settings/i }).first().click();
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('button', { name: 'See a live demo' })).toBeVisible({ timeout: 15_000 });

    // A fresh anonymous identity on the SAME flag-on server: its own fetch
    // must independently re-enable the journey (proving the hook refetches
    // per sign-in rather than caching), and it must start on a clean
    // Invisible Load with no trace of the first identity's item.
    await page.getByRole('button', { name: 'See a live demo' }).click();
    await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 15_000 });
    await openNovaTab(page);
    await expect(page.getByLabel('Journey stage')).toBeVisible();
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
    await page.getByRole('button', { name: /settings/i }).first().click();
    const toggle = page.getByRole('switch', { name: 'Behavioural Learning' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /settings/i }).first().click();
    await expect(page.getByRole('switch', { name: 'Behavioural Learning' })).toHaveAttribute('aria-checked', 'false');
  });
});

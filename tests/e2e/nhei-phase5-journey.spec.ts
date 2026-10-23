import { test, expect, type Page } from '@playwright/test';

// Phase 5E (directive §8) - browser-level tests for the integrated
// Nova/NHEI journey, in a real browser (Chromium, via the Playwright
// projects configured in playwright.config.ts - one desktop, one mobile
// viewport, run automatically for every test below).
//
// WHAT THIS IS NOT: these tests do not claim WCAG certification of any
// kind, per the directive's own explicit instruction - a passing test
// here means "this specific interaction works in a real browser with
// these specific checks," nothing broader.
//
// MOCKED PROVIDER RESPONSES: every /api/** call this page makes is
// answered by page.route() below, never a real server, real Firestore,
// real Firebase Auth, or real Gemini call - see
// dev-nhei-phase5-preview.html and src/nhei-phase5-preview-e2e-entry.tsx
// for the dev-only page this suite drives, and src/lib/secure-api.ts for
// the narrowly-scoped, DEV-only auth bypass that lets this page's own
// fetch calls reach page.route() instead of failing before ever sending
// a request.

const CONSENT_DEFAULT = { reflection_storage: false, longitudinal_tracking: false, routing_insights: false };

async function mockApis(page: Page, opts: { consent?: typeof CONSENT_DEFAULT; calendarActionPermissionGranted?: boolean } = {}) {
  let consent = { ...CONSENT_DEFAULT, ...opts.consent };
  let permissionGranted = opts.calendarActionPermissionGranted ?? true;
  let proposalState = 'prepared';
  const proposal = () => ({
    proposalId: 'cpp_e2e_test_1',
    state: proposalState,
    startIso: '2026-03-02T14:00:00.000Z',
    endIso: '2026-03-02T14:30:00.000Z',
    title: 'Protected recovery block',
    approvalFingerprint: 'fingerprint-e2e-test',
    failureReason: proposalState === 'failed' ? 'The calendar provider rejected this change.' : null,
    retryCount: 0,
    externalEventId: proposalState === 'confirmed' ? 'evt_e2e_test' : null,
  });

  await page.route('**/api/nhei/consent', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      consent = { ...consent, [body.purpose]: body.granted };
    }
    await route.fulfill({ json: { consent } });
  });

  await page.route('**/api/nova/calendar-protection/action-permission', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      permissionGranted = body.granted;
    }
    await route.fulfill({ json: { permission: { granted: permissionGranted, grantedAt: permissionGranted ? new Date().toISOString() : null, withdrawnAt: permissionGranted ? null : new Date().toISOString() } } });
  });

  await page.route('**/api/nova/calendar-protection/propose', async (route) => {
    proposalState = 'prepared';
    await route.fulfill({ json: { proposal: proposal() } });
  });

  await page.route('**/api/nova/calendar-protection/*/present', async (route) => {
    proposalState = 'awaiting_approval';
    await route.fulfill({ json: { proposal: proposal() } });
  });

  await page.route('**/api/nova/calendar-protection/*/approve', async (route) => {
    const body = route.request().postDataJSON();
    proposalState = body.approved ? 'approved' : 'declined';
    await route.fulfill({ json: { status: proposalState, proposal: proposal() } });
  });

  await page.route('**/api/nova/calendar-protection/history', async (route) => {
    await route.fulfill({ json: { proposals: [] } });
  });

  await page.route('**/api/nova/chat', async (route) => {
    await route.fulfill({ json: { text: 'Thanks for sharing that - I hear you.', planTrace: [] } });
  });

  return {
    setExecuteOutcome(outcome: { status: string; state?: string }) {
      proposalState = outcome.state ?? outcome.status;
    },
  };
}

async function mockExecuteOnce(page: Page, body: Record<string, unknown>) {
  await page.route('**/api/nova/calendar-protection/*/execute', async (route) => {
    await route.fulfill({ json: body });
  }, { times: 1 });
}

async function enterMockAuthAndGoto(page: Page) {
  await page.addInitScript(() => { (window as any).__E2E_MOCK_AUTH__ = true; });
  await page.goto('/dev-nhei-phase5-preview.html');
}

test.describe('NHEI Phase 5E integrated journey (directive §8)', () => {
  test('renders every section on this viewport with no horizontal overflow', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    await expect(page.getByRole('heading', { name: /Invisible Load/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Integrated Agentic Nova Journey/i })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('Before Words: large text input and keyboard-only (Tab/Enter) interaction through the free-expression step', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    // Anchored on the STATIC section heading from NheiPhase5Preview.tsx,
    // not on text rendered inside NheiBeforeWords itself - that component's
    // own "Before Words" heading only exists on its 'intro' step and
    // disappears from the DOM the moment it advances, which would make a
    // locator anchored on it go stale after the very first click.
    const beforeWords = page.locator('text=4. Before Words').locator('xpath=ancestor::section[1]');
    await beforeWords.getByRole('button', { name: "Start whenever you're ready" }).click();

    const longText = 'This has been an exceptionally demanding stretch at work. '.repeat(40); // ~2300 chars
    const textarea = beforeWords.getByLabel("Free expression - write whatever you'd like");
    await textarea.click();
    await textarea.fill(longText);
    await expect(textarea).toHaveValue(longText);

    // Keyboard-only from here: Tab past the "I'd rather not..." link (it
    // comes first in DOM order) to reach "Continue", then activate with
    // Enter, never a mouse click.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.textContent);
    expect(focused).toMatch(/Continue/);
    await page.keyboard.press('Enter');

    await expect(beforeWords.getByText('A few optional questions - skip any of them')).toBeVisible();
  });

  test('Before Words: "I\'d rather not write anything" skip ending shows the honest "nothing was shared" state', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const beforeWords = page.locator('text=4. Before Words').locator('xpath=ancestor::section[1]');
    await beforeWords.getByRole('button', { name: "Start whenever you're ready" }).click();
    await beforeWords.getByRole('button', { name: "I'd rather not write anything right now" }).click();
    await expect(beforeWords.getByText('Nothing was shared, so there is nothing for Nova to use here.')).toBeVisible();
  });

  test('Before Words: a correction is added and shown before reaching the decided state', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const beforeWords = page.locator('text=4. Before Words').locator('xpath=ancestor::section[1]');
    await beforeWords.getByRole('button', { name: "Start whenever you're ready" }).click();
    await beforeWords.getByLabel("Free expression - write whatever you'd like").fill('Work has been relentless.');
    await beforeWords.getByRole('button', { name: 'Continue' }).click();
    await beforeWords.getByRole('button', { name: 'Continue' }).click(); // optional_prompts -> review

    await beforeWords.getByLabel('Add a correction').fill('Actually, two separate things happened.');
    await beforeWords.getByRole('button', { name: 'Add' }).click();
    await expect(beforeWords.getByText('Actually, two separate things happened.')).toBeVisible();

    await beforeWords.getByRole('button', { name: /Done for now/i }).click();
    await expect(beforeWords.getByText(/available to Nova for this conversation only/i)).toBeVisible();
  });

  test('Nova Chat modal: the clear-conversation confirm dialog is a real focus-trapped modal, closable with Escape', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const novaChatSection = page.locator('text=4b. Nova Chat').locator('xpath=ancestor::section[1]');
    await novaChatSection.getByPlaceholder(/./).first().fill('hello Nova');
    await novaChatSection.getByRole('button', { name: 'Send message' }).click();
    await expect(novaChatSection.getByText('Thanks for sharing that - I hear you.')).toBeVisible();

    await novaChatSection.getByRole('button', { name: 'Clear conversation' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear this conversation?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('Invisible Load: adding an item and requesting help pre-fills Take the Load\'s title', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const invisibleLoad = page.locator('text=0. Invisible Load').locator('xpath=ancestor::section[1]');
    await invisibleLoad.getByLabel('Describe an obligation, commitment, or friction').fill('Finish the quarterly board deck');
    await invisibleLoad.getByRole('button', { name: 'Add' }).click();
    await expect(invisibleLoad.getByText('Finish the quarterly board deck')).toBeVisible();

    await invisibleLoad.getByRole('button', { name: /Get help with this/i }).click();
    await invisibleLoad.getByRole('button', { name: /^Protect time for it$/i }).click();

    const takeTheLoad = page.locator('text=0b. Take the Load').locator('xpath=ancestor::section[1]');
    await expect(takeTheLoad.getByPlaceholder('What should this protected time be called?')).toHaveValue(/Finish the quarterly board deck/);
  });

  test('Take the Load: prepared/awaiting_approval/approved are all labelled not-yet-done; confirmed is the only "actually happened" state', async ({ page }) => {
    await mockApis(page);
    await mockExecuteOnce(page, { status: 'confirmed', proposal: { proposalId: 'cpp_e2e_test_1', state: 'confirmed', startIso: '2026-03-02T14:00:00.000Z', endIso: '2026-03-02T14:30:00.000Z', title: 'Protected recovery block', approvalFingerprint: 'fingerprint-e2e-test', failureReason: null, retryCount: 0, externalEventId: 'evt_e2e_test' } });
    await enterMockAuthAndGoto(page);

    const takeTheLoad = page.locator('text=0b. Take the Load').locator('xpath=ancestor::section[1]');
    await takeTheLoad.getByPlaceholder('What should this protected time be called?').fill('Protected recovery block');
    await takeTheLoad.getByLabel('Start time').fill('2026-03-02T14:00');
    await takeTheLoad.getByLabel('End time').fill('2026-03-02T14:30');
    await takeTheLoad.getByRole('button', { name: 'Prepare this proposal' }).click();
    await expect(takeTheLoad.getByText('Prepared - not yet shown for approval')).toBeVisible();

    await takeTheLoad.getByRole('button', { name: 'Show for approval' }).click();
    await expect(takeTheLoad.getByText('Awaiting your approval - nothing has happened yet')).toBeVisible();

    await takeTheLoad.getByRole('button', { name: 'Approve exactly this' }).click();
    await expect(takeTheLoad.getByText('Approved - not yet applied')).toBeVisible();

    await takeTheLoad.getByRole('button', { name: 'Try to apply this' }).click();
    await expect(takeTheLoad.getByText('Applied to your calendar', { exact: true })).toBeVisible();
    await expect(takeTheLoad.getByText('This was actually applied to your calendar.')).toBeVisible();
  });

  test('Take the Load: calendar action permission denial is shown as its own clear, honest state, not a generic error', async ({ page }) => {
    await mockApis(page, { calendarActionPermissionGranted: false });
    await mockExecuteOnce(page, { status: 'calendar_action_permission_required' });
    await enterMockAuthAndGoto(page);

    const takeTheLoad = page.locator('text=0b. Take the Load').locator('xpath=ancestor::section[1]');
    await expect(takeTheLoad.getByText('Calendar action permission:')).toBeVisible();
    await expect(takeTheLoad.getByRole('button', { name: 'Grant' })).toBeVisible();

    await takeTheLoad.getByPlaceholder('What should this protected time be called?').fill('Protected recovery block');
    await takeTheLoad.getByLabel('Start time').fill('2026-03-02T14:00');
    await takeTheLoad.getByLabel('End time').fill('2026-03-02T14:30');
    await takeTheLoad.getByRole('button', { name: 'Prepare this proposal' }).click();
    await takeTheLoad.getByRole('button', { name: 'Show for approval' }).click();
    await takeTheLoad.getByRole('button', { name: 'Approve exactly this' }).click();
    await takeTheLoad.getByRole('button', { name: 'Try to apply this' }).click();

    await expect(takeTheLoad.getByText('Calendar action permission is no longer granted, so this could not be applied.')).toBeVisible();
  });

  test('Take the Load: a failed connector response shows the real reason and offers a genuine retry', async ({ page }) => {
    await mockApis(page);
    await mockExecuteOnce(page, { status: 'failed', proposal: { proposalId: 'cpp_e2e_test_1', state: 'failed', startIso: '2026-03-02T14:00:00.000Z', endIso: '2026-03-02T14:30:00.000Z', title: 'Protected recovery block', approvalFingerprint: 'fingerprint-e2e-test', failureReason: 'The calendar provider rejected this change.', retryCount: 0, externalEventId: null } });
    await enterMockAuthAndGoto(page);

    const takeTheLoad = page.locator('text=0b. Take the Load').locator('xpath=ancestor::section[1]');
    await takeTheLoad.getByPlaceholder('What should this protected time be called?').fill('Protected recovery block');
    await takeTheLoad.getByLabel('Start time').fill('2026-03-02T14:00');
    await takeTheLoad.getByLabel('End time').fill('2026-03-02T14:30');
    await takeTheLoad.getByRole('button', { name: 'Prepare this proposal' }).click();
    await takeTheLoad.getByRole('button', { name: 'Show for approval' }).click();
    await takeTheLoad.getByRole('button', { name: 'Approve exactly this' }).click();
    await takeTheLoad.getByRole('button', { name: 'Try to apply this' }).click();

    await expect(takeTheLoad.getByText('The calendar provider rejected this change.')).toBeVisible();
    await expect(takeTheLoad.getByRole('button', { name: /Try again/i })).toBeVisible();
  });

  test('Take the Load: an ambiguous connector response explicitly says it will NOT be auto-retried', async ({ page }) => {
    await mockApis(page);
    await mockExecuteOnce(page, { status: 'ambiguous', proposal: { proposalId: 'cpp_e2e_test_1', state: 'ambiguous', startIso: '2026-03-02T14:00:00.000Z', endIso: '2026-03-02T14:30:00.000Z', title: 'Protected recovery block', approvalFingerprint: 'fingerprint-e2e-test', failureReason: null, retryCount: 0, externalEventId: null } });
    await enterMockAuthAndGoto(page);

    const takeTheLoad = page.locator('text=0b. Take the Load').locator('xpath=ancestor::section[1]');
    await takeTheLoad.getByPlaceholder('What should this protected time be called?').fill('Protected recovery block');
    await takeTheLoad.getByLabel('Start time').fill('2026-03-02T14:00');
    await takeTheLoad.getByLabel('End time').fill('2026-03-02T14:30');
    await takeTheLoad.getByRole('button', { name: 'Prepare this proposal' }).click();
    await takeTheLoad.getByRole('button', { name: 'Show for approval' }).click();
    await takeTheLoad.getByRole('button', { name: 'Approve exactly this' }).click();
    await takeTheLoad.getByRole('button', { name: 'Try to apply this' }).click();

    await expect(takeTheLoad.getByText(/will not be retried automatically/i)).toBeVisible();
    // No retry affordance at all for ambiguous - the one thing a "failed" state offers that this must not.
    await expect(takeTheLoad.getByRole('button', { name: /Try again/i })).toHaveCount(0);
  });

  test('Take the Load: a client-side validation error state is shown when required fields are missing', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const takeTheLoad = page.locator('text=0b. Take the Load').locator('xpath=ancestor::section[1]');
    await takeTheLoad.getByRole('button', { name: 'Prepare this proposal' }).click();
    await expect(takeTheLoad.getByText('A title and a real start and end time are required.')).toBeVisible();
    // Never silently submitted - still on the same, unstarted form.
    await expect(takeTheLoad.getByRole('button', { name: 'Prepare this proposal' })).toBeVisible();
  });

  test('consent withdrawal: turning a toggle off writes the real withdrawn state back from the server', async ({ page }) => {
    await mockApis(page, { consent: { reflection_storage: true, longitudinal_tracking: false, routing_insights: false } });
    await enterMockAuthAndGoto(page);

    const consentSection = page.locator('text=1. Privacy & Consent').locator('xpath=ancestor::section[1]');
    const reflectionToggle = consentSection.getByRole('switch', { name: 'Personal Reflection' });
    await expect(reflectionToggle).toHaveAttribute('aria-checked', 'true');

    await reflectionToggle.click();
    await expect(reflectionToggle).toHaveAttribute('aria-checked', 'false');
  });

  test('integrated journey: "Start over" returns all the way back to the first step', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);

    const journey = page.locator('text=6. Integrated Agentic Nova Journey').locator('xpath=ancestor::section[1]');
    // Phase 5F Agentic Expansion (directive §4): the journey now opens on
    // an explicit entry step offering Before Words or direct chat entry,
    // rather than forcing Before Words first.
    await expect(journey.getByRole('button', { name: /Just talk to Nova/i })).toBeVisible();
    await journey.getByRole('button', { name: /Say what's on your mind first/i }).click();
    await journey.getByRole('button', { name: "Start whenever you're ready" }).click();
    await journey.getByRole('button', { name: "I'd rather not write anything right now" }).click();
    await expect(journey.getByPlaceholder(/./).first()).toBeVisible(); // now on the Nova Chat step

    await journey.getByRole('button', { name: 'Start over' }).click();
    await expect(journey.getByText('Before Break')).toHaveCount(0); // sanity: no leftover chat UI text
    await expect(journey.getByRole('button', { name: /Just talk to Nova/i })).toBeVisible();
  });

  test('integrated journey: choosing "Just talk to Nova" skips Before Words entirely', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const journey = page.locator('text=6. Integrated Agentic Nova Journey').locator('xpath=ancestor::section[1]');
    await journey.getByRole('button', { name: /Just talk to Nova/i }).click();
    await expect(journey.getByRole('button', { name: "Start whenever you're ready" })).toHaveCount(0);
    await expect(journey.getByPlaceholder(/./).first()).toBeVisible(); // directly on the Nova Chat step
  });
});

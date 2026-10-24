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
    await route.fulfill({ json: { proposals: [proposal()] } });
  });

  // Phase 5H, directive §3 - returning to saved progress: a bare GET by
  // the fixed mock id, exactly what "Resume" on a history entry calls.
  await page.route('**/api/nova/calendar-protection/cpp_e2e_test_1', async (route) => {
    await route.fulfill({ json: { proposal: proposal() } });
  });

  await page.route('**/api/nova/chat', async (route) => {
    await route.fulfill({ json: { text: 'Thanks for sharing that - I hear you.', planTrace: [] } });
  });

  // Phase 5G, directive §7/§10 - Task Deferral mocks for the full
  // integrated-journey browser test below. A single, stateful mock
  // proposal, the same real workflow shape nova-task-deferral-service.ts
  // actually returns.
  let tdState = 'identified';
  let tdFingerprint = '';
  const tdProposal = () => ({
    proposalId: 'tdp_e2e_test_1', state: tdState,
    identification: { taskDescription: 'Finish the quarterly board deck', currentDueDescription: 'Friday' },
    controlClarification: tdState === 'identified' ? null : { userControlsDeadline: 'yes', userControlsOwnership: 'yes' },
    postponementConsideration: ['prepared', 'awaiting_approval', 'approved', 'executing', 'confirmed', 'failed'].includes(tdState) ? { reasonablyPostponable: true, reasoning: 'Nobody is blocked on this right now.' } : null,
    proposedChange: ['prepared', 'awaiting_approval', 'approved', 'executing', 'confirmed', 'failed'].includes(tdState) ? { proposedNewDueDescription: 'next Friday', proposedNewPriority: null } : null,
    consequences: ['prepared', 'awaiting_approval', 'approved', 'executing', 'confirmed', 'failed'].includes(tdState) ? { consequences: ['Lands a week later.'], uncertainties: [] } : null,
    approvalFingerprint: tdFingerprint,
    failureReason: tdState === 'failed' ? 'simulated task update failure' : null,
    retryCount: 0,
  });

  await page.route('**/api/nova/task-deferral/identify', async (route) => {
    tdState = 'identified';
    await route.fulfill({ json: { proposal: tdProposal() } });
  });
  await page.route('**/api/nova/task-deferral/*/clarify-control', async (route) => {
    const body = route.request().postDataJSON();
    tdState = (body.userControlsDeadline === 'yes' && body.userControlsOwnership === 'yes') ? 'clarified' : 'requires_other_person';
    await route.fulfill({ json: { status: tdState, proposal: tdProposal() } });
  });
  await page.route('**/api/nova/task-deferral/*/prepare', async (route) => {
    tdState = 'prepared';
    tdFingerprint = 'td-fingerprint-e2e';
    await route.fulfill({ json: { proposal: tdProposal() } });
  });
  await page.route('**/api/nova/task-deferral/*/present', async (route) => {
    tdState = 'awaiting_approval';
    await route.fulfill({ json: { proposal: tdProposal() } });
  });
  await page.route('**/api/nova/task-deferral/*/approve', async (route) => {
    const body = route.request().postDataJSON();
    tdState = body.approved ? 'approved' : 'declined';
    await route.fulfill({ json: { status: tdState, proposal: tdProposal() } });
  });
  await page.route('**/api/nova/task-deferral/*/execute', async (route) => {
    tdState = 'confirmed';
    await route.fulfill({ json: { status: tdState, proposal: tdProposal() } });
  });
  await page.route('**/api/nova/task-deferral/*/outcome', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { record: { workflow: 'task_deferral', itemId: 'tdp_e2e_test_1', outcome: body.outcome, recordedAt: new Date().toISOString() } } });
  });
  await page.route('**/api/nova/task-deferral/history', async (route) => {
    await route.fulfill({ json: { proposals: [tdProposal()] } });
  });

  // Phase 5H, directive §3 - returning to saved progress: a bare GET by
  // the fixed mock id, exactly what "Resume" on a history entry calls.
  await page.route('**/api/nova/task-deferral/tdp_e2e_test_1', async (route) => {
    await route.fulfill({ json: { proposal: tdProposal() } });
  });

  // Phase 5G, directive §2 - the possible-suggestion route.
  await page.route('**/api/nova/proactive-suggestions', async (route) => {
    const body = route.request().postDataJSON();
    const obligation = body.voluntarilySharedObligation ?? body.statedGoal ?? 'this';
    await route.fulfill({
      json: {
        suggestions: [{
          suggestionId: 'sugg_e2e_1', category: 'calendar_protection',
          description: `You could protect a block of time for "${obligation}" on your calendar.`,
          basedOn: ['the obligation you shared', 'your calendar action permission is currently granted'],
          whyItMightHelp: 'Having protected time can help.',
          requiresPermissionOrIntegration: 'Calendar action permission - already granted.',
          whatHappensIfYouProceed: "You'll review and approve an exact proposal - nothing is created yet.",
          whatNovaCannotDoYet: 'Real calendar execution is turned off platform-wide right now.',
        }],
      },
    });
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
    // Phase 5G §6 investigation: this assertion previously read "...this
    // conversation only", which never matched NheiBeforeWords.tsx's real,
    // intentional 'decided'-step copy ("available to Nova for this ONE
    // REPLY only" - directive §5's own "temporary, not saved" framing,
    // unchanged since Phase 5D). Confirmed by reproducing the failure
    // against the unmodified Phase 5F baseline and reading the component
    // source directly: this was a stale/incorrect test assertion, not a
    // UI regression, a state-transition bug, or a timing issue - the
    // component has never rendered the phrase the old assertion expected.
    await expect(beforeWords.getByText(/available to Nova for this one reply only/i)).toBeVisible();
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

  // Phase 5G Experience Integration (directive §2/§7/§10, acceptance
  // criterion) - the complete journey in a real browser: describing
  // overload, identifying a specific obligation, seeing an explainable
  // proactive suggestion, choosing Calendar Protection, reviewing and
  // approving a proposal, and receiving an accurate (execution-disabled)
  // status.
  test('full journey: Nova chat -> Invisible Load -> Proactive Options -> Calendar Protection -> review -> approve -> accurate status', async ({ page }) => {
    await mockApis(page);
    await mockExecuteOnce(page, { status: 'execution_disabled' });
    await enterMockAuthAndGoto(page);
    const journey = page.locator('text=6. Integrated Agentic Nova Journey').locator('xpath=ancestor::section[1]');

    await journey.getByRole('button', { name: /Just talk to Nova/i }).click();
    await journey.getByRole('button', { name: /Continue to what's on your plate/i }).click();

    await journey.getByRole('button', { name: /See what Nova might proactively suggest/i }).click();
    await journey.getByLabel(/obligation or goal for proactive suggestions/i).fill('Finish the quarterly board deck');
    await journey.getByRole('button', { name: /See what Nova can suggest/i }).click();

    // The suggestion explains what/why/requirement/consequence/limit (directive §2).
    await expect(journey.getByText(/you could protect a block of time/i)).toBeVisible();
    await expect(journey.getByText(/why this might help/i)).toBeVisible();
    await expect(journey.getByText(/what's required/i)).toBeVisible();
    await expect(journey.getByText(/if you proceed/i)).toBeVisible();
    await expect(journey.getByText(/nova can't yet/i)).toBeVisible();

    await journey.getByRole('button', { name: /^use this$/i }).click();

    // Now on Calendar Protection, pre-filled from the accepted suggestion.
    await expect(journey.getByPlaceholder('What should this protected time be called?')).toHaveValue(/Finish the quarterly board deck/);
    await journey.getByLabel(/start time/i).fill('2026-03-02T14:00');
    await journey.getByLabel(/end time/i).fill('2026-03-02T14:30');
    await journey.getByRole('button', { name: /prepare this proposal/i }).click();
    await journey.getByRole('button', { name: /show for approval/i }).click();
    await journey.getByRole('button', { name: /approve exactly this/i }).click();
    await journey.getByRole('button', { name: /try to apply this/i }).click();

    // An accurate status that never implies a real calendar write occurred.
    await expect(journey.getByText(/nothing was actually sent to your calendar/i)).toBeVisible();
  });

  // Phase 5G acceptance criterion, Task Deferral path: identifying an
  // obligation, choosing Task Deferral specifically, reviewing/approving
  // a proposal, an accurate simulated-execution status, and an optional
  // outcome-feedback record.
  test('full journey: Invisible Load -> Task Deferral -> review -> approve -> accurate simulation status -> optional outcome', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const journey = page.locator('text=6. Integrated Agentic Nova Journey').locator('xpath=ancestor::section[1]');

    await journey.getByRole('button', { name: /Just talk to Nova/i }).click();
    await journey.getByRole('button', { name: /Continue to what's on your plate/i }).click();

    await journey.getByLabel(/describe an obligation, commitment, or friction/i).fill('Finish the quarterly board deck');
    await journey.getByRole('button', { name: /^add$/i }).click();
    await journey.getByRole('button', { name: /get help with this/i }).click();
    await journey.getByRole('button', { name: /defer or reprioritise it/i }).click();

    // Now on Task Deferral, pre-filled from the Invisible Load item.
    await expect(journey.getByLabel(/task description/i)).toHaveValue(/Finish the quarterly board deck/);
    await journey.getByRole('button', { name: /tell nova about this task/i }).click();

    await expect(journey.getByText(/do you control when this is due/i)).toBeVisible();
    const deadlineGroup = journey.getByText(/do you control when this is due/i).locator('xpath=following-sibling::div[1]');
    await deadlineGroup.getByRole('button', { name: /^yes$/i }).click();
    const ownershipGroup = journey.getByText(/is this task yours alone to move/i).locator('xpath=following-sibling::div[1]');
    await ownershipGroup.getByRole('button', { name: /^yes$/i }).click();
    await journey.getByRole('button', { name: /^continue$/i }).click();

    await journey.getByLabel(/proposed new due date/i).fill('next Friday');
    await journey.getByPlaceholder(/why \(or why not\)/i).fill('Nobody is blocked on this right now.');
    await journey.getByRole('button', { name: /prepare this proposal/i }).click();
    await journey.getByRole('button', { name: /show for approval/i }).click();
    await journey.getByRole('button', { name: /approve exactly this/i }).click();
    await journey.getByRole('button', { name: /run the simulation/i }).click();

    // Accurate status - a simulation, never described as a real task change.
    await expect(journey.getByText(/no real asana, monday, or jira task was modified/i)).toBeVisible();

    // Optional, user-confirmed outcome feedback.
    await journey.getByRole('button', { name: /^this helped$/i }).click();
    await expect(journey.getByText(/thanks - noted/i)).toBeVisible();

    // Optional follow-up: returning to what's on your plate without losing the result above.
    await journey.getByRole('button', { name: /something else is on your plate too/i }).click();
    await expect(journey.getByText('Finish the quarterly board deck')).toBeVisible();
  });

  // Phase 5H, directive §3/§7 - progress preservation: a real,
  // server-persisted proposal survives a real browser reload (every
  // in-memory React state - the journey step, the on-screen proposal -
  // is genuinely gone) and can be deliberately resumed afterwards via
  // "Show my history" -> "Resume", never automatically/silently.
  test('resume: a prepared Calendar Protection proposal survives a browser reload and is restored only on an explicit Resume', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    let journey = page.locator('text=6. Integrated Agentic Nova Journey').locator('xpath=ancestor::section[1]');

    await journey.getByRole('button', { name: /Just talk to Nova/i }).click();
    await journey.getByRole('button', { name: /Continue to what's on your plate/i }).click();
    await journey.getByLabel(/describe an obligation, commitment, or friction/i).fill('Protected recovery block');
    await journey.getByRole('button', { name: /^add$/i }).click();
    await journey.getByRole('button', { name: /get help with this/i }).click();
    await journey.getByRole('button', { name: /protect time for it/i }).click();

    await journey.getByLabel(/start time/i).fill('2026-03-02T14:00');
    await journey.getByLabel(/end time/i).fill('2026-03-02T14:30');
    await journey.getByRole('button', { name: /prepare this proposal/i }).click();
    await journey.getByRole('button', { name: /show for approval/i }).click();
    await expect(journey.getByText(/awaiting your approval/i)).toBeVisible();

    // The real browser reload - the journey step and the on-screen
    // proposal are both gone; this is NOT itself the resume mechanism.
    await page.reload();
    journey = page.locator('text=6. Integrated Agentic Nova Journey').locator('xpath=ancestor::section[1]');
    await expect(journey.getByRole('button', { name: /Just talk to Nova/i })).toBeVisible();
    await expect(journey.getByText(/awaiting your approval/i)).toHaveCount(0);

    // Navigate back to the Calendar Protection screen (a fresh, blank
    // form - nothing about the prior proposal was silently restored),
    // then explicitly resume the real, still-persisted proposal.
    await journey.getByRole('button', { name: /Just talk to Nova/i }).click();
    await journey.getByRole('button', { name: /Continue to what's on your plate/i }).click();
    await journey.getByLabel(/describe an obligation, commitment, or friction/i).fill('Something else entirely');
    await journey.getByRole('button', { name: /^add$/i }).click();
    await journey.getByRole('button', { name: /get help with this/i }).click();
    await journey.getByRole('button', { name: /protect time for it/i }).click();
    await expect(journey.getByLabel(/start time/i)).toHaveValue('');

    await journey.getByRole('button', { name: /show my history/i }).click();
    await expect(journey.getByText(/protected recovery block/i)).toBeVisible();
    await journey.getByRole('button', { name: /^resume$/i }).click();
    await expect(journey.getByText('Awaiting your approval - nothing has happened yet', { exact: true })).toBeVisible();
    await expect(journey.getByRole('button', { name: /approve exactly this/i })).toBeVisible();
  });

  // Same resume guarantee for Task Deferral.
  test('resume: an awaiting-approval Task Deferral proposal survives a browser reload and is restored only on an explicit Resume', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    let journey = page.locator('text=6. Integrated Agentic Nova Journey').locator('xpath=ancestor::section[1]');

    await journey.getByRole('button', { name: /Just talk to Nova/i }).click();
    await journey.getByRole('button', { name: /Continue to what's on your plate/i }).click();
    await journey.getByLabel(/describe an obligation, commitment, or friction/i).fill('Finish the quarterly board deck');
    await journey.getByRole('button', { name: /^add$/i }).click();
    await journey.getByRole('button', { name: /get help with this/i }).click();
    await journey.getByRole('button', { name: /defer or reprioritise it/i }).click();

    await journey.getByRole('button', { name: /tell nova about this task/i }).click();
    const deadlineGroup = journey.getByText(/do you control when this is due/i).locator('xpath=following-sibling::div[1]');
    await deadlineGroup.getByRole('button', { name: /^yes$/i }).click();
    const ownershipGroup = journey.getByText(/is this task yours alone to move/i).locator('xpath=following-sibling::div[1]');
    await ownershipGroup.getByRole('button', { name: /^yes$/i }).click();
    await journey.getByRole('button', { name: /^continue$/i }).click();
    await journey.getByLabel(/proposed new due date/i).fill('next Friday');
    await journey.getByPlaceholder(/why \(or why not\)/i).fill('Nobody is blocked on this right now.');
    await journey.getByRole('button', { name: /prepare this proposal/i }).click();
    await journey.getByRole('button', { name: /show for approval/i }).click();
    await expect(journey.getByText(/awaiting your approval/i)).toBeVisible();

    await page.reload();
    journey = page.locator('text=6. Integrated Agentic Nova Journey').locator('xpath=ancestor::section[1]');
    await expect(journey.getByRole('button', { name: /Just talk to Nova/i })).toBeVisible();

    await journey.getByRole('button', { name: /Just talk to Nova/i }).click();
    await journey.getByRole('button', { name: /Continue to what's on your plate/i }).click();
    await journey.getByLabel(/describe an obligation, commitment, or friction/i).fill('Something else entirely');
    await journey.getByRole('button', { name: /^add$/i }).click();
    await journey.getByRole('button', { name: /get help with this/i }).click();
    await journey.getByRole('button', { name: /defer or reprioritise it/i }).click();
    await expect(journey.getByLabel(/task description/i)).toHaveValue('Something else entirely');

    await journey.getByRole('button', { name: /show my history/i }).click();
    await expect(journey.getByText(/finish the quarterly board deck/i)).toBeVisible();
    await journey.getByRole('button', { name: /^resume$/i }).click();
    await expect(journey.getByText('Awaiting your approval - nothing has happened yet', { exact: true })).toBeVisible();
    await expect(journey.getByRole('button', { name: /approve exactly this/i })).toBeVisible();
  });

  // Phase 5H, directive §7 - the full customer-experience demonstration,
  // the DECLINED (failed) branch: describe an obligation -> Nova offers
  // Task Deferral -> a proposal is prepared -> the user reviews and
  // DECLINES it -> an accurate "nothing was changed" result is shown
  // (never worded as if a real task was touched) -> the user can still
  // resume that same declined proposal afterwards. The successful/
  // approved branch is already demonstrated above; this closes the
  // directive's explicit "test both successful and failed scenarios."
  test('full journey: Task Deferral - user reviews and declines, sees an accurate result, and can still resume it afterwards', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const journey = page.locator('text=6. Integrated Agentic Nova Journey').locator('xpath=ancestor::section[1]');

    await journey.getByRole('button', { name: /Just talk to Nova/i }).click();
    await journey.getByRole('button', { name: /Continue to what's on your plate/i }).click();
    await journey.getByLabel(/describe an obligation, commitment, or friction/i).fill('Finish the quarterly board deck');
    await journey.getByRole('button', { name: /^add$/i }).click();
    await journey.getByRole('button', { name: /get help with this/i }).click();
    await journey.getByRole('button', { name: /defer or reprioritise it/i }).click();

    await journey.getByRole('button', { name: /tell nova about this task/i }).click();
    const deadlineGroup = journey.getByText(/do you control when this is due/i).locator('xpath=following-sibling::div[1]');
    await deadlineGroup.getByRole('button', { name: /^yes$/i }).click();
    const ownershipGroup = journey.getByText(/is this task yours alone to move/i).locator('xpath=following-sibling::div[1]');
    await ownershipGroup.getByRole('button', { name: /^yes$/i }).click();
    await journey.getByRole('button', { name: /^continue$/i }).click();
    await journey.getByLabel(/proposed new due date/i).fill('next Friday');
    await journey.getByPlaceholder(/why \(or why not\)/i).fill('Nobody is blocked on this right now.');
    await journey.getByRole('button', { name: /prepare this proposal/i }).click();
    await journey.getByRole('button', { name: /show for approval/i }).click();
    await expect(journey.getByText('Awaiting your approval - nothing has happened yet', { exact: true })).toBeVisible();

    await journey.getByRole('button', { name: /^decline$/i }).click();
    await expect(journey.getByText(/you declined this - nothing was changed/i)).toBeVisible();
    // A decline has its own honest wording - it never borrows the
    // simulation-completed copy, and there is nothing left to simulate.
    await expect(journey.getByRole('button', { name: /run the simulation/i })).toHaveCount(0);

    // Resuming still works for a declined (failed) outcome, not only an approved one.
    await journey.getByRole('button', { name: /show my history/i }).click();
    await journey.getByRole('button', { name: /^resume$/i }).click();
    await expect(journey.getByText('Declined - nothing was changed', { exact: true })).toBeVisible();
  });
});

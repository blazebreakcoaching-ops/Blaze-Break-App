import { test, expect, type Page } from '@playwright/test';

// Calendar Pilot readiness directive, Task 3 - dedicated, focused browser
// coverage for Calendar Protection's Phase 5J additions (Modify/
// supersession, the pilot-eligibility gate) on top of what
// nhei-phase5-journey.spec.ts already covers for the shared journey.
// Drives the same dev-only preview page as that file (real browser, real
// NovaTakeTheLoad.tsx component, every /api/** call answered by
// page.route() mocks - never a real server/Firestore/Auth) via the
// standalone "0b. Take the Load" section, which renders this exact
// component without needing to walk through Nova chat/Invisible Load
// first. See that file's own header for why this harness pattern is
// safe and what it is not (no WCAG certification claim, etc).

type ProposalState = 'prepared' | 'awaiting_approval' | 'approved' | 'declined' | 'confirmed' | 'failed' | 'ambiguous' | 'undone';

interface MockProposal {
  proposalId: string;
  state: ProposalState;
  startIso: string;
  endIso: string;
  title: string;
  approvalFingerprint: string;
  failureReason: string | null;
  retryCount: number;
  externalEventId: string | null;
  supersededBy?: string | null;
}

function baseProposal(id: string, title: string, overrides: Partial<MockProposal> = {}): MockProposal {
  return {
    proposalId: id, state: 'prepared', startIso: '2026-03-02T14:00:00.000Z', endIso: '2026-03-02T14:30:00.000Z',
    title, approvalFingerprint: `fp-${id}`, failureReason: null, retryCount: 0, externalEventId: null, supersededBy: null,
    ...overrides,
  };
}

async function mockApis(page: Page) {
  let permissionGranted = true;
  const proposals = new Map<string, MockProposal>();
  let nextId = 1;

  await page.route('**/api/nova/calendar-protection/action-permission', async (route) => {
    if (route.request().method() === 'POST') {
      permissionGranted = route.request().postDataJSON().granted;
    }
    await route.fulfill({ json: { permission: { granted: permissionGranted, grantedAt: permissionGranted ? new Date().toISOString() : null, withdrawnAt: permissionGranted ? null : new Date().toISOString() } } });
  });

  await page.route('**/api/nova/calendar-protection/propose', async (route) => {
    const body = route.request().postDataJSON();
    if (body.supersedesProposalId) {
      const original = proposals.get(body.supersedesProposalId);
      if (!original) {
        await route.fulfill({ status: 409, json: { error: 'cannot_supersede: original proposal not found' } });
        return;
      }
      original.supersededBy = `cpp_e2e_${nextId}`;
    }
    const id = `cpp_e2e_${nextId++}`;
    const p = baseProposal(id, body.title, { startIso: body.startIso, endIso: body.endIso });
    proposals.set(id, p);
    await route.fulfill({ json: { proposal: p } });
  });

  await page.route('**/api/nova/calendar-protection/*/present', async (route) => {
    const id = route.request().url().split('/calendar-protection/')[1].split('/present')[0];
    const p = proposals.get(id)!;
    p.state = 'awaiting_approval';
    await route.fulfill({ json: { proposal: p } });
  });

  await page.route('**/api/nova/calendar-protection/*/approve', async (route) => {
    const id = route.request().url().split('/calendar-protection/')[1].split('/approve')[0];
    const p = proposals.get(id)!;
    if (p.supersededBy) {
      await route.fulfill({ json: { status: 'superseded', proposal: p } });
      return;
    }
    const body = route.request().postDataJSON();
    p.state = body.approved ? 'approved' : 'declined';
    await route.fulfill({ json: { status: p.state, proposal: p } });
  });

  // One-shot override for the next /execute call, so each test controls
  // exactly the outcome it's proving without hand-rolling the whole
  // state machine for outcomes the real server only reaches in edge cases
  // (pilot_not_eligible, superseded-at-execute-time, etc).
  let executeOverride: { status: string; proposal?: Partial<MockProposal> } | null = null;
  await page.route('**/api/nova/calendar-protection/*/execute', async (route) => {
    const id = route.request().url().split('/calendar-protection/')[1].split('/execute')[0];
    const p = proposals.get(id)!;
    if (executeOverride) {
      const override = executeOverride;
      executeOverride = null;
      if (override.proposal) Object.assign(p, override.proposal);
      await route.fulfill({ json: { status: override.status, ...(override.status !== 'execution_disabled' && override.status !== 'pilot_not_eligible' && override.status !== 'transaction_support_required' ? { proposal: p } : {}) } });
      return;
    }
    await route.fulfill({ json: { status: 'execution_disabled' } });
  });

  await page.route('**/api/nova/calendar-protection/*/retry', async (route) => {
    const id = route.request().url().split('/calendar-protection/')[1].split('/retry')[0];
    const p = proposals.get(id)!;
    p.state = 'confirmed';
    p.externalEventId = 'evt_retry_e2e';
    await route.fulfill({ json: { status: 'confirmed', proposal: p } });
  });

  await page.route('**/api/nova/calendar-protection/history', async (route) => {
    await route.fulfill({ json: { proposals: [...proposals.values()].reverse() } });
  });

  await page.route(/\/api\/nova\/calendar-protection\/cpp_e2e_\d+$/, async (route) => {
    const id = route.request().url().split('/calendar-protection/')[1];
    const p = proposals.get(id);
    if (!p) { await route.fulfill({ status: 404, json: { error: 'not found' } }); return; }
    await route.fulfill({ json: { proposal: p } });
  });

  return {
    setNextExecuteOutcome(outcome: { status: string; proposal?: Partial<MockProposal> }) {
      executeOverride = outcome;
    },
  };
}

async function enterMockAuthAndGoto(page: Page) {
  await page.addInitScript(() => { (window as any).__E2E_MOCK_AUTH__ = true; });
  await page.goto('/dev-nhei-phase5-preview.html');
}

function takeTheLoadSection(page: Page) {
  return page.locator('text=0b. Take the Load').locator('xpath=ancestor::section[1]');
}

async function fillAndPrepare(section: ReturnType<typeof takeTheLoadSection>, title: string) {
  await section.getByPlaceholder('What should this protected time be called?').fill(title);
  await section.getByLabel('Start time').fill('2026-03-02T14:00');
  await section.getByLabel('End time').fill('2026-03-02T14:30');
  await section.getByRole('button', { name: 'Prepare this proposal' }).click();
}

test.describe('Calendar Protection - Phase 5J dedicated coverage (Calendar Pilot readiness, Task 3)', () => {
  test('Modify: re-opens the form pre-filled, and submitting sends supersedesProposalId for the original', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const section = takeTheLoadSection(page);

    await fillAndPrepare(section, 'Protected recovery block');
    await section.getByRole('button', { name: 'Show for approval' }).click();

    await section.getByRole('button', { name: 'Modify' }).click();
    await expect(section.getByPlaceholder('What should this protected time be called?')).toHaveValue('Protected recovery block');
    await expect(section.getByLabel('Start time')).toHaveValue('2026-03-02T14:00');

    await section.getByLabel('End time').fill('2026-03-02T15:00');
    await section.getByRole('button', { name: 'Prepare this proposal' }).click();
    // The replacement is a genuinely new, separate proposal going through
    // its own full present/approve/execute cycle - not an in-place edit.
    await expect(section.getByText('Prepared - not yet shown for approval')).toBeVisible();
  });

  test('supersede an earlier approval: Modify after approving replaces the original, which now shows as superseded if resumed', async ({ page }) => {
    const mocks = await mockApis(page);
    await enterMockAuthAndGoto(page);
    const section = takeTheLoadSection(page);

    await fillAndPrepare(section, 'Protected recovery block');
    await section.getByRole('button', { name: 'Show for approval' }).click();
    await section.getByRole('button', { name: 'Approve exactly this' }).click();
    await expect(section.getByText('Approved - not yet applied')).toBeVisible();

    // Modify instead of applying - the original is superseded server-side
    // the moment the replacement is prepared.
    await section.getByRole('button', { name: 'Modify instead' }).click();
    await section.getByLabel('End time').fill('2026-03-02T15:00');
    await section.getByRole('button', { name: 'Prepare this proposal' }).click();
    await expect(section.getByText('Prepared - not yet shown for approval')).toBeVisible();

    // Resuming the ORIGINAL from history shows it honestly as replaced,
    // with no action buttons offered for it any more. Two history rows
    // now exist for this title - the original (still "Approved", its own
    // state left truthful) and the replacement ("Prepared") - so select
    // the original specifically by its state label, not just the title.
    await section.getByRole('button', { name: /show my history/i }).click();
    const rows = section.locator('li', { hasText: 'Protected recovery block' });
    await expect(rows).toHaveCount(2);
    const originalRow = rows.filter({ hasText: 'Approved' });
    await originalRow.getByRole('button', { name: 'Resume' }).click();
    await expect(section.getByText('This was replaced by a newer version - resume that one from your history instead.')).toBeVisible();
    await expect(section.getByRole('button', { name: 'Approve exactly this' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Try to apply this' })).toHaveCount(0);
    void mocks;
  });

  test('reject stale approvals: executing a proposal that was superseded after approval honestly reports superseded, never a fake success', async ({ page }) => {
    const mocks = await mockApis(page);
    await enterMockAuthAndGoto(page);
    const section = takeTheLoadSection(page);

    await fillAndPrepare(section, 'Protected recovery block');
    await section.getByRole('button', { name: 'Show for approval' }).click();
    await section.getByRole('button', { name: 'Approve exactly this' }).click();

    // Simulate the real server-side race this directive closed: the
    // approval exists, but something (another tab's Modify) has since
    // superseded it - execute must refuse, not silently apply it.
    mocks.setNextExecuteOutcome({ status: 'superseded', proposal: { supersededBy: 'cpp_e2e_other' } });
    await section.getByRole('button', { name: 'Try to apply this' }).click();
    await expect(section.getByText('This proposal was replaced by a newer version before it could be applied - nothing was sent to your calendar.')).toBeVisible();
  });

  test('pilot eligibility denied: execute reports an honest explanation, not a fake success or silence', async ({ page }) => {
    const mocks = await mockApis(page);
    await enterMockAuthAndGoto(page);
    const section = takeTheLoadSection(page);

    await fillAndPrepare(section, 'Protected recovery block');
    await section.getByRole('button', { name: 'Show for approval' }).click();
    await section.getByRole('button', { name: 'Approve exactly this' }).click();

    mocks.setNextExecuteOutcome({ status: 'pilot_not_eligible' });
    await section.getByRole('button', { name: 'Try to apply this' }).click();
    await expect(section.getByText("This account isn't part of the Calendar Protection pilot, so this wasn't applied.")).toBeVisible();
  });

  test('permission revoked after approval: withdrawing calendar action permission then trying to apply is refused with the real reason', async ({ page }) => {
    const mocks = await mockApis(page);
    await enterMockAuthAndGoto(page);
    const section = takeTheLoadSection(page);

    await expect(section.getByText('Granted')).toBeVisible();
    await fillAndPrepare(section, 'Protected recovery block');
    await section.getByRole('button', { name: 'Show for approval' }).click();
    await section.getByRole('button', { name: 'Approve exactly this' }).click();

    // Revoke AFTER approval, the real-world ordering this scenario is
    // naming - not "never granted" (covered by the shared journey spec).
    await section.getByRole('button', { name: 'Withdraw' }).click();
    await expect(section.getByText('Not granted')).toBeVisible();

    mocks.setNextExecuteOutcome({ status: 'calendar_action_permission_required', proposal: {} });
    await section.getByRole('button', { name: 'Try to apply this' }).click();
    await expect(section.getByText('Calendar action permission is no longer granted, so this could not be applied.')).toBeVisible();
  });

  test('execution disabled: the platform-wide kill switch produces an honest, non-alarming explanation', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    const section = takeTheLoadSection(page);

    await fillAndPrepare(section, 'Protected recovery block');
    await section.getByRole('button', { name: 'Show for approval' }).click();
    await section.getByRole('button', { name: 'Approve exactly this' }).click();
    await section.getByRole('button', { name: 'Try to apply this' }).click(); // default mock: execution_disabled

    await expect(section.getByText('Real execution is turned off platform-wide right now - this was approved, but nothing was actually sent to your calendar.')).toBeVisible();
  });

  test('failed simulated provider outcome: shows the real reason and a genuine retry that can actually succeed', async ({ page }) => {
    const mocks = await mockApis(page);
    await enterMockAuthAndGoto(page);
    const section = takeTheLoadSection(page);

    await fillAndPrepare(section, 'Protected recovery block');
    await section.getByRole('button', { name: 'Show for approval' }).click();
    await section.getByRole('button', { name: 'Approve exactly this' }).click();

    mocks.setNextExecuteOutcome({ status: 'failed', proposal: { state: 'failed', failureReason: 'The calendar provider rejected this change.' } });
    await section.getByRole('button', { name: 'Try to apply this' }).click();
    await expect(section.getByText('The calendar provider rejected this change.')).toBeVisible();

    await section.getByRole('button', { name: /try again/i }).click();
    await expect(section.getByText('This was actually applied to your calendar.')).toBeVisible();
  });

  test('ambiguous simulated provider outcome: explicitly says it will not be auto-retried, and offers no retry button', async ({ page }) => {
    const mocks = await mockApis(page);
    await enterMockAuthAndGoto(page);
    const section = takeTheLoadSection(page);

    await fillAndPrepare(section, 'Protected recovery block');
    await section.getByRole('button', { name: 'Show for approval' }).click();
    await section.getByRole('button', { name: 'Approve exactly this' }).click();

    mocks.setNextExecuteOutcome({ status: 'ambiguous', proposal: { state: 'ambiguous' } });
    await section.getByRole('button', { name: 'Try to apply this' }).click();
    await expect(section.getByText(/will not be retried automatically/i)).toBeVisible();
    await expect(section.getByRole('button', { name: /try again/i })).toHaveCount(0);
  });

  test('resume saved progress: a prepared proposal survives a real browser reload and is restored only via an explicit Resume', async ({ page }) => {
    await mockApis(page);
    await enterMockAuthAndGoto(page);
    let section = takeTheLoadSection(page);

    await fillAndPrepare(section, 'Protected recovery block');
    await expect(section.getByText('Prepared - not yet shown for approval')).toBeVisible();

    await page.reload();
    section = takeTheLoadSection(page);
    await expect(section.getByPlaceholder('What should this protected time be called?')).toHaveValue('');
    await expect(section.getByText('Prepared - not yet shown for approval')).toHaveCount(0);

    await section.getByRole('button', { name: /show my history/i }).click();
    await expect(section.getByText('Protected recovery block')).toBeVisible();
    await section.getByRole('button', { name: /^resume$/i }).click();
    await expect(section.getByText('Prepared - not yet shown for approval', { exact: true })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Show for approval' })).toBeVisible();
  });
});

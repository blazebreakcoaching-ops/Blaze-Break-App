// Nova Task Deferral UI (Phase 5G, directive §7). Real rendered-DOM tests
// against a mocked secureApiFetch, covering the full identify -> clarify
// -> prepare -> present -> approve -> execute journey, the restricted
// requires_other_person path and its safe-assistance panel, approval
// modification, decline, expired/rejected approval, network/server
// errors, returning to saved proposals via history, and that the
// simulated-execution messaging never implies a real task was touched.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NovaTaskDeferral } from './NovaTaskDeferral';
import { SecureApiError } from '../lib/secure-api';

vi.mock('../lib/secure-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/secure-api')>('../lib/secure-api');
  return { ...actual, secureApiFetch: vi.fn() };
});
import { secureApiFetch } from '../lib/secure-api';

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

const BASE_PROPOSAL = {
  proposalId: 'tdp_test', state: 'identified',
  identification: { taskDescription: 'Finish the quarterly report', currentDueDescription: 'Friday' },
  controlClarification: null, postponementConsideration: null, proposedChange: null, consequences: null,
  approvalFingerprint: '', failureReason: null, retryCount: 0,
};

beforeEach(() => {
  vi.mocked(secureApiFetch).mockReset();
});

async function identifyTask() {
  await userEvent.type(screen.getByLabelText(/task description/i), 'Finish the quarterly report');
  await userEvent.click(screen.getByRole('button', { name: /tell nova about this task/i }));
}

async function answerControl(deadline: 'yes' | 'no' | 'unsure', ownership: 'yes' | 'no' | 'unsure') {
  const deadlineGroup = screen.getByText(/do you control when this is due/i).closest('div') as HTMLElement;
  await userEvent.click(within(deadlineGroup).getByRole('button', { name: new RegExp(`^${deadline}$`, 'i') }));
  const ownershipGroup = screen.getByText(/is this task yours alone to move/i).closest('div') as HTMLElement;
  await userEvent.click(within(ownershipGroup).getByRole('button', { name: new RegExp(`^${ownership}$`, 'i') }));
  await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
}

describe('NovaTaskDeferral - identify + control clarification gate', () => {
  it('identifying a task calls the real route and shows the control questions', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: BASE_PROPOSAL }));
    render(<NovaTaskDeferral />);
    await identifyTask();
    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledWith('/api/nova/task-deferral/identify', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText(/do you control when this is due/i)).toBeInTheDocument();
  });

  it('"no"/"unsure" routes to requires_other_person and shows the safe-assistance panel, never a proposal form', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: BASE_PROPOSAL }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'requires_other_person', proposal: { ...BASE_PROPOSAL, state: 'requires_other_person' } }));
    render(<NovaTaskDeferral />);
    await identifyTask();
    await screen.findByText(/do you control when this is due/i);
    await answerControl('no', 'unsure');
    expect(await screen.findByText(/this isn't something nova can move for you/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /prepare this proposal/i })).not.toBeInTheDocument();
    // Safe assistance (directive §5) is offered instead.
    expect(screen.getByRole('button', { name: /break it into smaller steps/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /draft a message asking for more time/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /who'd know/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /consider other priorities instead/i })).toBeInTheDocument();
  });
});

describe('NovaTaskDeferral - safe assistance never reaches execution', () => {
  async function toRestricted() {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: BASE_PROPOSAL }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'requires_other_person', proposal: { ...BASE_PROPOSAL, state: 'requires_other_person' } }));
    render(<NovaTaskDeferral />);
    await identifyTask();
    await screen.findByText(/do you control when this is due/i);
    await answerControl('no', 'no');
    await screen.findByText(/this isn't something nova can move for you/i);
  }

  it('"Break it into smaller steps" only ever stores the user\'s own words locally', async () => {
    await toRestricted();
    await userEvent.click(screen.getByRole('button', { name: /break it into smaller steps/i }));
    await userEvent.type(screen.getByLabelText(/add a breakdown step/i), 'Ask about the real deadline');
    await userEvent.click(screen.getByRole('button', { name: /add step/i }));
    expect(screen.getByText('Ask about the real deadline')).toBeInTheDocument();
    // No further network call happened beyond identify + clarify.
    expect(secureApiFetch).toHaveBeenCalledTimes(2);
  });

  it('"Draft a message asking for more time" never sends anything - no send button exists at all', async () => {
    await toRestricted();
    await userEvent.click(screen.getByRole('button', { name: /draft a message asking for more time/i }));
    expect((screen.getByLabelText(/draft message asking for more time/i) as HTMLTextAreaElement).value).toContain('Finish the quarterly report');
    expect(screen.queryByRole('button', { name: /^send/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeInTheDocument();
  });

  it('"Consider other priorities instead" names a real existing tool, never a score', async () => {
    await toRestricted();
    await userEvent.click(screen.getByRole('button', { name: /consider other priorities instead/i }));
    expect(screen.getByText(/workload reality check/i)).toBeInTheDocument();
  });
});

describe('NovaTaskDeferral - ordinary completion (accurate simulated-execution messaging)', () => {
  async function toApproved() {
    const CLARIFIED = { ...BASE_PROPOSAL, state: 'clarified' };
    const PREPARED = { ...CLARIFIED, state: 'prepared', approvalFingerprint: 'fp1', proposedChange: { proposedNewDueDescription: 'next Friday', proposedNewPriority: null }, postponementConsideration: { reasonablyPostponable: true, reasoning: 'Nobody is blocked.' }, consequences: { consequences: ['Lands later'], uncertainties: [] } };
    const AWAITING = { ...PREPARED, state: 'awaiting_approval' };
    const APPROVED = { ...AWAITING, state: 'approved' };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: BASE_PROPOSAL }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'clarified', proposal: CLARIFIED }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: PREPARED }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: AWAITING }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'approved', proposal: APPROVED }));
    render(<NovaTaskDeferral />);
    await identifyTask();
    await screen.findByText(/do you control when this is due/i);
    await answerControl('yes', 'yes');
    await screen.findByRole('button', { name: /prepare this proposal/i });
    await userEvent.type(screen.getByLabelText(/proposed new due date/i), 'next Friday');
    await userEvent.type(screen.getByPlaceholderText(/why \(or why not\)/i), 'Nobody is blocked.');
    await userEvent.click(screen.getByRole('button', { name: /prepare this proposal/i }));
    await userEvent.click(await screen.findByRole('button', { name: /show for approval/i }));
    await userEvent.click(await screen.findByRole('button', { name: /approve exactly this/i }));
    return APPROVED;
  }

  it('running the simulation shows wording that never implies a real task was modified', async () => {
    await toApproved();
    const CONFIRMED = { ...BASE_PROPOSAL, state: 'confirmed', approvalFingerprint: 'fp1' };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'confirmed', proposal: CONFIRMED }));
    await userEvent.click(await screen.findByRole('button', { name: /run the simulation/i }));
    // Both the state label and the success message legitimately say
    // "Simulation completed" (directive §4: legible on its own, in either
    // place) - findAllByText confirms at least one is present without
    // the ambiguous-match error a bare findByText would throw here.
    expect((await screen.findAllByText(/simulation completed/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/no real asana, monday, or jira task was modified/i)).toBeInTheDocument();
  });

  it('a failed simulation is described as a simulation failure, not a real one, and offers retry', async () => {
    await toApproved();
    const FAILED = { ...BASE_PROPOSAL, state: 'failed', approvalFingerprint: 'fp1', failureReason: 'simulated task update failure' };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'failed', proposal: FAILED }));
    await userEvent.click(await screen.findByRole('button', { name: /run the simulation/i }));
    expect(await screen.findByText(/no real task was touched/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('NovaTaskDeferral - approval modification and decline', () => {
  async function toAwaitingApproval() {
    const CLARIFIED = { ...BASE_PROPOSAL, state: 'clarified' };
    const PREPARED = { ...CLARIFIED, state: 'prepared', approvalFingerprint: 'fp-orig', proposedChange: { proposedNewDueDescription: 'next Friday', proposedNewPriority: null }, postponementConsideration: { reasonablyPostponable: true, reasoning: 'ok' }, consequences: { consequences: [], uncertainties: [] } };
    const AWAITING = { ...PREPARED, state: 'awaiting_approval' };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: BASE_PROPOSAL }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'clarified', proposal: CLARIFIED }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: PREPARED }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: AWAITING }));
    render(<NovaTaskDeferral />);
    await identifyTask();
    await screen.findByText(/do you control when this is due/i);
    await answerControl('yes', 'yes');
    await screen.findByRole('button', { name: /prepare this proposal/i });
    await userEvent.type(screen.getByLabelText(/proposed new due date/i), 'next Friday');
    await userEvent.type(screen.getByPlaceholderText(/why \(or why not\)/i), 'ok');
    await userEvent.click(screen.getByRole('button', { name: /prepare this proposal/i }));
    await userEvent.click(await screen.findByRole('button', { name: /show for approval/i }));
  }

  it('"Modify" returns to the prepare form rather than approving the original terms', async () => {
    await toAwaitingApproval();
    await userEvent.click(await screen.findByRole('button', { name: /^modify$/i }));
    expect(await screen.findByRole('button', { name: /prepare this proposal/i })).toBeInTheDocument();
  });

  it('declining records the decision and shows an honest "nothing was changed" message', async () => {
    await toAwaitingApproval();
    const DECLINED = { ...BASE_PROPOSAL, state: 'declined', approvalFingerprint: 'fp-orig' };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'declined', proposal: DECLINED }));
    await userEvent.click(await screen.findByRole('button', { name: /^decline$/i }));
    expect(await screen.findByText(/you declined this - nothing was changed/i)).toBeInTheDocument();
  });

  it('a fingerprint mismatch on approve shows a clear error instead of silently approving', async () => {
    await toAwaitingApproval();
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'fingerprint_mismatch' }));
    await userEvent.click(await screen.findByRole('button', { name: /approve exactly this/i }));
    expect(await screen.findByText(/changed since it was shown to you/i)).toBeInTheDocument();
  });
});

describe('NovaTaskDeferral - expired approval', () => {
  it('an expired approval is explained honestly and the proposal reverts to awaiting approval', async () => {
    const AWAITING = { ...BASE_PROPOSAL, state: 'awaiting_approval', approvalFingerprint: 'fp1' };
    const APPROVED = { ...AWAITING, state: 'approved' };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: BASE_PROPOSAL }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'clarified', proposal: { ...BASE_PROPOSAL, state: 'clarified' } }));
    render(<NovaTaskDeferral />);
    await identifyTask();
    await screen.findByText(/do you control when this is due/i);
    await answerControl('yes', 'yes');

    // Jump straight to an approved proposal via "Show my history" is not
    // modelled here - instead simulate reaching `approved` then executing
    // into an expired-approval response, the real path a stale tab takes.
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: { ...BASE_PROPOSAL, state: 'prepared', approvalFingerprint: 'fp1', proposedChange: { proposedNewDueDescription: 'later', proposedNewPriority: null }, postponementConsideration: { reasonablyPostponable: true, reasoning: 'ok' }, consequences: { consequences: [], uncertainties: [] } } }));
    await screen.findByRole('button', { name: /prepare this proposal/i });
    await userEvent.type(screen.getByLabelText(/proposed new due date/i), 'later');
    await userEvent.type(screen.getByPlaceholderText(/why \(or why not\)/i), 'ok');
    await userEvent.click(screen.getByRole('button', { name: /prepare this proposal/i }));

    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: AWAITING }));
    await userEvent.click(await screen.findByRole('button', { name: /show for approval/i }));

    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'approved', proposal: APPROVED }));
    await userEvent.click(await screen.findByRole('button', { name: /approve exactly this/i }));

    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'approval_expired', proposal: AWAITING }));
    await userEvent.click(await screen.findByRole('button', { name: /run the simulation/i }));
    expect(await screen.findByText(/your approval expired/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /approve exactly this/i })).toBeInTheDocument();
  });
});

describe('NovaTaskDeferral - network and server errors', () => {
  it('a network/server error on identify shows the real error, not a crash', async () => {
    vi.mocked(secureApiFetch).mockRejectedValueOnce(new SecureApiError('Server error', 500));
    render(<NovaTaskDeferral />);
    await identifyTask();
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('a non-SecureApiError throw (e.g. a network failure) falls back to a generic, honest message', async () => {
    vi.mocked(secureApiFetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<NovaTaskDeferral />);
    await identifyTask();
    expect(await screen.findByText(/could not identify this task/i)).toBeInTheDocument();
  });

  it('a server error loading history is shown, not swallowed', async () => {
    vi.mocked(secureApiFetch).mockRejectedValueOnce(new SecureApiError('Server error', 500));
    render(<NovaTaskDeferral />);
    await userEvent.click(screen.getByRole('button', { name: /show my history/i }));
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });
});

describe('NovaTaskDeferral - returning to saved proposals', () => {
  it('history lists real, previously saved proposals with accurate state labels', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({
      proposals: [
        { ...BASE_PROPOSAL, proposalId: 'tdp_old', state: 'confirmed', identification: { taskDescription: 'Old task', currentDueDescription: null } },
        { ...BASE_PROPOSAL, proposalId: 'tdp_older', state: 'requires_other_person', identification: { taskDescription: 'Shared task', currentDueDescription: null } },
      ],
    }));
    render(<NovaTaskDeferral />);
    await userEvent.click(screen.getByRole('button', { name: /show my history/i }));
    expect(await screen.findByText(/old task/i)).toBeInTheDocument();
    expect(screen.getByText(/simulation completed - no real task was modified/i)).toBeInTheDocument();
    expect(screen.getByText(/shared task/i)).toBeInTheDocument();
    expect(screen.getByText(/this needs that other person, not nova/i)).toBeInTheDocument();
  });

  it('an empty history shows an honest "nothing yet" rather than a fabricated entry', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposals: [] }));
    render(<NovaTaskDeferral />);
    await userEvent.click(screen.getByRole('button', { name: /show my history/i }));
    expect(await screen.findByText(/nothing yet/i)).toBeInTheDocument();
  });
});

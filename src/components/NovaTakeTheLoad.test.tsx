// Nova Take the Load - Calendar Protection UI (Phase 5D, directive §2/§7).
// Real rendered-DOM tests against a mocked secureApiFetch, covering the
// full prepare -> present -> approve -> execute journey and the honest
// execution_disabled state, permission denial, and failure paths.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NovaTakeTheLoad } from './NovaTakeTheLoad';
import { SecureApiError } from '../lib/secure-api';

vi.mock('../lib/secure-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/secure-api')>('../lib/secure-api');
  return { ...actual, secureApiFetch: vi.fn() };
});
import { secureApiFetch } from '../lib/secure-api';

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

const NOT_GRANTED = { permission: { granted: false, grantedAt: null, withdrawnAt: null } };
const GRANTED = { permission: { granted: true, grantedAt: '2026-01-01T00:00:00.000Z', withdrawnAt: null } };

beforeEach(() => {
  vi.mocked(secureApiFetch).mockReset();
  vi.mocked(secureApiFetch).mockResolvedValue(jsonResponse(NOT_GRANTED));
});

describe('NovaTakeTheLoad', () => {
  it('loads and shows the calendar action permission state on mount', async () => {
    render(<NovaTakeTheLoad />);
    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledWith('/api/nova/calendar-protection/action-permission'));
    expect(await screen.findByText('Not granted')).toBeInTheDocument();
  });

  it('granting the permission calls the write route and reflects the new state', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse(NOT_GRANTED));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse(GRANTED));
    render(<NovaTakeTheLoad />);
    const grantButton = await screen.findByRole('button', { name: /grant/i });
    await userEvent.click(grantButton);
    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledWith('/api/nova/calendar-protection/action-permission', { method: 'POST', data: { granted: true } }));
    expect(await screen.findByText('Granted')).toBeInTheDocument();
  });

  it('the full prepare -> present -> approve -> execute journey ends with the honest execution_disabled explanation, never a fake success', async () => {
    const PROPOSAL = {
      proposalId: 'cpp_test', state: 'prepared', startIso: '2026-03-01T10:00:00.000Z', endIso: '2026-03-01T10:30:00.000Z',
      title: 'Protected block', approvalFingerprint: 'fp123', failureReason: null, retryCount: 0, externalEventId: null,
    };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse(NOT_GRANTED)); // permission load
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: PROPOSAL })); // propose
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: { ...PROPOSAL, state: 'awaiting_approval' } })); // present
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'approved', proposal: { ...PROPOSAL, state: 'approved' } })); // approve
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'execution_disabled' })); // execute

    render(<NovaTakeTheLoad initialTitle="Protected block" />);
    await screen.findByText('Not granted');

    await userEvent.type(screen.getByLabelText(/start time/i), '2026-03-01T10:00');
    await userEvent.type(screen.getByLabelText(/end time/i), '2026-03-01T10:30');
    await userEvent.click(screen.getByRole('button', { name: /prepare this proposal/i }));
    await waitFor(() => expect(screen.getByText(/awaiting your approval|prepared - not yet/i)).toBeInTheDocument());

    const presentButton = screen.queryByRole('button', { name: /show for approval/i });
    if (presentButton) await userEvent.click(presentButton);

    const approveButton = await screen.findByRole('button', { name: /approve exactly this/i });
    await userEvent.click(approveButton);

    const applyButton = await screen.findByRole('button', { name: /try to apply this/i });
    await userEvent.click(applyButton);

    expect(await screen.findByText(/nothing was actually sent to your calendar/i)).toBeInTheDocument();
  });

  // Phase 5G, directive §8 - "an outcome confirmed by the user" needs to
  // be reachable here too, the same as it already is in Task Deferral,
  // but only once a REAL action (not a disabled/simulated one) actually
  // completed.
  it('once confirmed (a real applied action), offers optional outcome feedback and reports it on its own endpoint', async () => {
    const PROPOSAL = {
      proposalId: 'cpp_confirmed', state: 'prepared', startIso: '2026-03-01T10:00:00.000Z', endIso: '2026-03-01T10:30:00.000Z',
      title: 'Protected block', approvalFingerprint: 'fp123', failureReason: null, retryCount: 0, externalEventId: null,
    };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse(NOT_GRANTED)); // permission load
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: PROPOSAL })); // propose
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: { ...PROPOSAL, state: 'awaiting_approval' } })); // present
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'approved', proposal: { ...PROPOSAL, state: 'approved' } })); // approve
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'confirmed', proposal: { ...PROPOSAL, state: 'confirmed', externalEventId: 'evt_real' } })); // execute
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ record: { workflow: 'calendar_protection', itemId: 'cpp_confirmed', outcome: 'helped', recordedAt: '2026-03-01T10:40:00.000Z' } })); // outcome

    render(<NovaTakeTheLoad initialTitle="Protected block" />);
    await screen.findByText('Not granted');

    await userEvent.type(screen.getByLabelText(/start time/i), '2026-03-01T10:00');
    await userEvent.type(screen.getByLabelText(/end time/i), '2026-03-01T10:30');
    await userEvent.click(screen.getByRole('button', { name: /prepare this proposal/i }));

    const presentButton = screen.queryByRole('button', { name: /show for approval/i });
    if (presentButton) await userEvent.click(presentButton);

    const approveButton = await screen.findByRole('button', { name: /approve exactly this/i });
    await userEvent.click(approveButton);

    const applyButton = await screen.findByRole('button', { name: /try to apply this/i });
    await userEvent.click(applyButton);

    expect(await screen.findByText(/this was actually applied to your calendar/i)).toBeInTheDocument();
    const helpedButton = await screen.findByRole('button', { name: /^this helped$/i });
    await userEvent.click(helpedButton);

    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledWith(
      '/api/nova/calendar-protection/cpp_confirmed/outcome', { method: 'POST', data: { outcome: 'helped' } },
    ));
    expect(await screen.findByText(/thanks - noted/i)).toBeInTheDocument();
  });

  it('a fingerprint mismatch on approve shows a clear error instead of silently approving', async () => {
    const PROPOSAL = {
      proposalId: 'cpp_test2', state: 'awaiting_approval', startIso: '2026-03-01T10:00:00.000Z', endIso: '2026-03-01T10:30:00.000Z',
      title: 'x', approvalFingerprint: 'fp123', failureReason: null, retryCount: 0, externalEventId: null,
    };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse(NOT_GRANTED));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: PROPOSAL }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ status: 'fingerprint_mismatch' }));

    render(<NovaTakeTheLoad />);
    await screen.findByText('Not granted');
    await userEvent.type(screen.getByLabelText(/title for the protected time/i), 'x');
    await userEvent.type(screen.getByLabelText(/start time/i), '2026-03-01T10:00');
    await userEvent.type(screen.getByLabelText(/end time/i), '2026-03-01T10:30');
    await userEvent.click(screen.getByRole('button', { name: /prepare this proposal/i }));

    const approveButton = await screen.findByRole('button', { name: /approve exactly this/i });
    await userEvent.click(approveButton);
    expect(await screen.findByText(/changed since it was shown to you/i)).toBeInTheDocument();
  });

  it('a propose failure (permission denied) shows the server error rather than crashing', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse(NOT_GRANTED));
    vi.mocked(secureApiFetch).mockRejectedValueOnce(new SecureApiError('Calendar signals are not enabled for this account.', 403));

    render(<NovaTakeTheLoad />);
    await screen.findByText('Not granted');
    await userEvent.type(screen.getByLabelText(/title for the protected time/i), 'x');
    await userEvent.type(screen.getByLabelText(/start time/i), '2026-03-01T10:00');
    await userEvent.type(screen.getByLabelText(/end time/i), '2026-03-01T10:30');
    await userEvent.click(screen.getByRole('button', { name: /prepare this proposal/i }));
    expect(await screen.findByText(/calendar signals are not enabled/i)).toBeInTheDocument();
  });

  it('loading history calls the real route and lists results', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse(NOT_GRANTED));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposals: [{ proposalId: 'cpp_1', state: 'declined', title: 'Old one' }] }));
    render(<NovaTakeTheLoad />);
    await screen.findByText('Not granted');
    await userEvent.click(screen.getByRole('button', { name: /show my history/i }));
    expect(await screen.findByText(/old one/i)).toBeInTheDocument();
  });

  // Phase 5H, directive §3 - returning to saved progress: a history entry
  // can be resumed back into the active screen, reusing the existing
  // GET /:proposalId route rather than any new storage.
  it('resuming a history entry fetches the real saved proposal by id and loads it into the active view', async () => {
    const SAVED = {
      proposalId: 'cpp_saved', state: 'awaiting_approval', startIso: '2026-03-01T10:00:00.000Z', endIso: '2026-03-01T10:30:00.000Z',
      title: 'Protect focus block', approvalFingerprint: 'fp-saved', failureReason: null, retryCount: 0, externalEventId: null,
    };
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse(NOT_GRANTED));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposals: [{ ...SAVED, title: 'Protect focus block' }] }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ proposal: SAVED }));

    render(<NovaTakeTheLoad />);
    await screen.findByText('Not granted');
    await userEvent.click(screen.getByRole('button', { name: /show my history/i }));
    await screen.findByText(/protect focus block/i);

    await userEvent.click(screen.getByRole('button', { name: /^resume$/i }));

    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledWith('/api/nova/calendar-protection/cpp_saved'));
    expect(await screen.findByRole('button', { name: /approve exactly this/i })).toBeInTheDocument();
  });
});

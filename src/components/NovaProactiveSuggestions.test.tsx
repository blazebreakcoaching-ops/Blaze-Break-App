// Nova Proactive Suggestions UI (Phase 5G, directive §2/§7). Real
// rendered-DOM tests against a mocked secureApiFetch - the real interface
// for POST /api/nova/proactive-suggestions, previously UI-less.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NovaProactiveSuggestions } from './NovaProactiveSuggestions';
import { SecureApiError } from '../lib/secure-api';

vi.mock('../lib/secure-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/secure-api')>('../lib/secure-api');
  return { ...actual, secureApiFetch: vi.fn() };
});
import { secureApiFetch } from '../lib/secure-api';

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

const SUGGESTION = {
  suggestionId: 's1', category: 'calendar_protection', description: 'You could protect a block of time for "Finish the report".',
  basedOn: ['the obligation you shared', 'your calendar action permission is currently granted'],
  whyItMightHelp: 'Having protected time can help.',
  requiresPermissionOrIntegration: 'Calendar action permission - already granted.',
  whatHappensIfYouProceed: "You'll review and approve an exact proposal - nothing is created yet.",
  whatNovaCannotDoYet: 'Real calendar execution is turned off platform-wide right now.',
};

beforeEach(() => {
  vi.mocked(secureApiFetch).mockReset();
});

describe('NovaProactiveSuggestions', () => {
  it('fetching sends the typed obligation/goal and capacity band to the real route', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ suggestions: [] }));
    render(<NovaProactiveSuggestions capacityBand="low_bandwidth" onUseForCalendarProtection={vi.fn()} onUseForTaskDeferral={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/obligation or goal/i), 'Finish the report');
    await userEvent.click(screen.getByRole('button', { name: /see what nova can suggest/i }));
    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledWith('/api/nova/proactive-suggestions', {
      method: 'POST',
      data: { statedGoal: null, voluntarilySharedObligation: 'Finish the report', capacityBand: 'low_bandwidth', priorUserConfirmedPlan: null },
    }));
  });

  it('shows all six explanatory fields a real decision needs - what, support, why, requirement, consequence, limit', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ suggestions: [SUGGESTION] }));
    render(<NovaProactiveSuggestions onUseForCalendarProtection={vi.fn()} onUseForTaskDeferral={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /see what nova can suggest/i }));
    expect(await screen.findByText(SUGGESTION.description)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(SUGGESTION.basedOn[0]))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(SUGGESTION.whyItMightHelp))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(SUGGESTION.requiresPermissionOrIntegration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(SUGGESTION.whatHappensIfYouProceed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(SUGGESTION.whatNovaCannotDoYet))).toBeInTheDocument();
  });

  it('"Use this" hands the typed text to the matching real-flow callback - accept', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ suggestions: [SUGGESTION] }));
    const onUseForCalendarProtection = vi.fn();
    render(<NovaProactiveSuggestions initialObligationOrGoal="Finish the report" onUseForCalendarProtection={onUseForCalendarProtection} onUseForTaskDeferral={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /see what nova can suggest/i }));
    await screen.findByText(SUGGESTION.description);
    await userEvent.click(screen.getByRole('button', { name: /use this/i }));
    expect(onUseForCalendarProtection).toHaveBeenCalledWith('Finish the report');
  });

  it('"Edit before using" lets the user change the text before accepting - edit', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ suggestions: [SUGGESTION] }));
    const onUseForCalendarProtection = vi.fn();
    render(<NovaProactiveSuggestions initialObligationOrGoal="Finish the report" onUseForCalendarProtection={onUseForCalendarProtection} onUseForTaskDeferral={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /see what nova can suggest/i }));
    await screen.findByText(SUGGESTION.description);
    await userEvent.click(screen.getByRole('button', { name: /edit before using/i }));
    const editBox = screen.getByLabelText(new RegExp(`Edit before using: ${SUGGESTION.description}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await userEvent.clear(editBox);
    await userEvent.type(editBox, 'Finish the board deck instead');
    await userEvent.click(screen.getByRole('button', { name: /use this/i }));
    expect(onUseForCalendarProtection).toHaveBeenCalledWith('Finish the board deck instead');
  });

  it('"Dismiss" removes one suggestion from view without calling any callback - dismiss', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ suggestions: [SUGGESTION] }));
    const onUseForCalendarProtection = vi.fn();
    render(<NovaProactiveSuggestions onUseForCalendarProtection={onUseForCalendarProtection} onUseForTaskDeferral={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /see what nova can suggest/i }));
    await screen.findByText(SUGGESTION.description);
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(SUGGESTION.description)).not.toBeInTheDocument();
    expect(onUseForCalendarProtection).not.toHaveBeenCalled();
  });

  it('shows an honest empty state when there is nothing to suggest, never a fabricated one - ignore is always fine', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ suggestions: [] }));
    render(<NovaProactiveSuggestions onUseForCalendarProtection={vi.fn()} onUseForTaskDeferral={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /see what nova can suggest/i }));
    expect(await screen.findByText(/nothing to suggest right now/i)).toBeInTheDocument();
  });

  it('shows a real error message rather than silently failing when the route call fails', async () => {
    vi.mocked(secureApiFetch).mockRejectedValueOnce(new SecureApiError('Server error', 500));
    render(<NovaProactiveSuggestions onUseForCalendarProtection={vi.fn()} onUseForTaskDeferral={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /see what nova can suggest/i }));
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });
});

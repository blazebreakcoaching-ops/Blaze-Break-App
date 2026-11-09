import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  secureApiFetch: vi.fn(),
  currentUser: { uid: 'member-one' } as { uid: string } | null,
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.currentUser }) }));
vi.mock('../lib/firebase', () => ({
  auth: { get currentUser() { return mocks.currentUser; } },
}));
vi.mock('../lib/secure-api', async () => {
  const actual = await vi.importActual<any>('../lib/secure-api');
  return { ...actual, secureApiFetch: mocks.secureApiFetch };
});

import { RecoveryInsightsPanel } from './RecoveryInsightsPanel';
import { SecureApiError } from '../lib/secure-api';

const ok = (body: unknown) => ({ ok: true, json: async () => body });
const insight = (over: Record<string, unknown>) => ({
  type: 'energy_trend', label: 'Energy', state: 'available', value: 40, direction: 'falling', tone: 'worse',
  confidence: 'medium', sourceCount: 8, explanation: 'Your logged energy has been going down, based on 8 records from the last 30 days.', ...over,
});

beforeEach(() => {
  mocks.currentUser = { uid: 'member-one' };
  mocks.secureApiFetch.mockReset();
});

describe('Your insights panel', () => {
  it('shows real insights in plain English with an accessible graphic, and nothing invented for unavailable ones', async () => {
    mocks.secureApiFetch.mockResolvedValueOnce(ok({ insights: [
      insight({}),
      insight({ type: 'mood_trend', label: 'Mood', state: 'not_enough_data', value: null, tone: 'unknown', explanation: 'Not enough data yet.' }),
    ], novaMayUse: {} }));
    render(<RecoveryInsightsPanel />);
    expect(await screen.findByText(/going down, based on 8 records/)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Energy: 40 out of 100, worth some attention' })).toBeTruthy();
    expect(screen.getByText('Not enough data yet.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /^Mood:/ })).toBeNull();
  });

  it('removes old results and ignores an old pending response after same-UID reauthentication', async () => {
    let resolveOld!: (value: ReturnType<typeof ok>) => void;
    const oldResponse = new Promise<ReturnType<typeof ok>>(resolve => { resolveOld = resolve; });
    mocks.secureApiFetch.mockImplementationOnce(() => oldResponse);
    mocks.secureApiFetch.mockResolvedValueOnce(ok({ insights: [
      insight({ explanation: 'Only the new session may see this result.' }),
    ] }));
    const { rerender } = render(<RecoveryInsightsPanel />);
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenCalledTimes(1));
    mocks.currentUser = { uid: 'member-one' };
    rerender(<RecoveryInsightsPanel />);
    expect(await screen.findByText(/Only the new session/)).toBeTruthy();
    resolveOld(ok({ insights: [insight({ explanation: 'Old session private insight.' })] }));
    await waitFor(() => expect(screen.queryByText('Old session private insight.')).toBeNull());
    expect(screen.getByText(/Only the new session/)).toBeTruthy();
  });

  it('shows the real reason when insights cannot load', async () => {
    mocks.secureApiFetch.mockRejectedValueOnce(new SecureApiError('Your insights could not be loaded right now. Please try again.', 500));
    render(<RecoveryInsightsPanel />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be loaded/);
  });

  it('explains consent clearly when Nova is not allowed to see insights', async () => {
    mocks.secureApiFetch
      .mockResolvedValueOnce(ok({ insights: [insight({})], novaMayUse: {} }))
      .mockResolvedValueOnce(ok({ explanation: null, reason: 'no_consent', used: [] }));
    render(<RecoveryInsightsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Nova to explain' }));
    expect(await screen.findByText(/haven't allowed it/)).toBeTruthy();
    expect(mocks.secureApiFetch).toHaveBeenLastCalledWith('/api/recovery/insights/explain', { method: 'POST', data: {} });
  });

  it("shows Nova's explanation with a consent and non-medical note", async () => {
    mocks.secureApiFetch
      .mockResolvedValueOnce(ok({ insights: [insight({})], novaMayUse: { energy_trend: true } }))
      .mockResolvedValueOnce(ok({ explanation: 'Your energy has dipped. Try one protected break a day.', reason: null, used: ['energy_trend'] }));
    render(<RecoveryInsightsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Nova to explain' }));
    expect(await screen.findByText(/protected break a day/)).toBeTruthy();
    expect(screen.getByText(/only the insights you allow/)).toBeTruthy();
  });

  it('disables "Ask Nova" until at least one insight is available', async () => {
    mocks.secureApiFetch.mockResolvedValueOnce(ok({ insights: [insight({ state: 'not_calculated', value: null, tone: 'unknown' })], novaMayUse: {} }));
    render(<RecoveryInsightsPanel />);
    const button = await screen.findByRole('button', { name: 'Ask Nova to explain' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Update my insights" recalculates on the server, then reloads', async () => {
    mocks.secureApiFetch
      .mockResolvedValueOnce(ok({ insights: [insight({ state: 'not_calculated', value: null })], novaMayUse: {} }))
      .mockResolvedValueOnce(ok({ success: true }))
      .mockResolvedValueOnce(ok({ insights: [insight({})], novaMayUse: {} }));
    render(<RecoveryInsightsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Update my insights' }));
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenCalledWith('/api/recovery/recalculate', { method: 'POST', data: {} }));
    expect(await screen.findByRole('img', { name: /Energy: 40/ })).toBeTruthy();
  });
});

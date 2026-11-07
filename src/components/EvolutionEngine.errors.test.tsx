import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// secureApiFetch throws on any refusal, so the Evolution Engine's
// `if (res.ok) ... else` branches never ran and every governance refusal
// (frozen engine, wrong proposal state, missing permission) showed only a
// generic "Couldn't ..." message. The admin must see the server's reason.
const mocks = vi.hoisted(() => ({ secureApiFetch: vi.fn() }));
vi.mock('../lib/secure-api', async () => {
  const actual = await vi.importActual<any>('../lib/secure-api');
  return { ...actual, secureApiFetch: mocks.secureApiFetch };
});
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'owner_1', email: 'o@test.dev' }, role: 'platform_owner' }) }));
vi.mock('../lib/feature-flags', () => ({ useFeatureFlags: () => ({}), setFeatureFlag: vi.fn() }));
vi.mock('../lib/nova-brain', () => ({ getNovaBrain: () => [], deleteNovaMemory: vi.fn() }));

const { SecureApiError } = await import('../lib/secure-api');
const { EvolutionEngine } = await import('./EvolutionEngine');

beforeEach(() => {
  mocks.secureApiFetch.mockReset().mockRejectedValue(
    new SecureApiError('Forbidden: Evolution Engine access required.', 403));
});

describe('Evolution Engine shows the real reason for a refusal', () => {
  it('feature registry load shows the server message, not a generic one', async () => {
    render(<EvolutionEngine />);
    fireEvent.click(screen.getByRole('tab', { name: /Feature Registry & Flags/i }));
    expect(await screen.findByText('Forbidden: Evolution Engine access required.')).toBeTruthy();
    expect(screen.queryByText("Couldn't load the feature registry.")).toBeNull();
  });

  it('keeps the generic message for a non-API failure', async () => {
    mocks.secureApiFetch.mockReset().mockRejectedValue(new Error('socket hang up'));
    render(<EvolutionEngine />);
    fireEvent.click(screen.getByRole('tab', { name: /Feature Registry & Flags/i }));
    expect(await screen.findByText("Couldn't load the feature registry.")).toBeTruthy();
  });
});

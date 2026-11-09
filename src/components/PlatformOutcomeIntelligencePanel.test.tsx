import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { uid: 'content-user', email: 'member@test.dev', emailVerified: true } as
    { uid: string; email: string; emailVerified: boolean } | null,
  role: 'content_admin',
  api: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.user, appRole: mocks.role }) }));
vi.mock('../lib/firebase', () => ({ auth: { get currentUser() { return mocks.user; } } }));
vi.mock('../lib/secure-api', () => ({
  secureApiFetch: mocks.api,
  SecureApiError: class extends Error {},
}));
import { PlatformOutcomeIntelligencePanel } from './PlatformOutcomeIntelligencePanel';

const asResponse = (data: unknown) => ({ json: async () => data });
beforeEach(() => {
  mocks.user = { uid: 'content-user', email: 'member@test.dev', emailVerified: true };
  mocks.role = 'content_admin';
  mocks.api.mockReset().mockImplementation((path: string) => {
    if (path.includes('/product-intelligence')) return Promise.resolve(asResponse({
      lookbackDays: 90,
      grounding: { totalEvents: 2, sufficientSample: false, sampleThreshold: 20 },
      movement: { totalEvents: 47, sufficientSample: true, sampleThreshold: 20 },
      recoveryRecipes: { totalEvents: 0, sufficientSample: false, sampleThreshold: 20 },
    }));
    return Promise.resolve(asResponse({
      lookbackDays: 90, modules: [{
        module: 'guided_reset', recommended: 5, resolved: 4, completed: 4,
        completionRate: null, netPositiveRate: null,
      }], adaptiveComparison: {
        adapted: { rated: 0, positiveRate: null },
        standard: { rated: 4, positiveRate: null },
        unknownProvenance: 4,
        caveat: 'Observational, not causal.',
      },
    }));
  });
});

describe('Command Centre aggregate outcomes', () => {
  it('is lazy and never invents unsupported effectiveness percentages', async () => {
    render(<PlatformOutcomeIntelligencePanel />);
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'View platform outcomes' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Completion: Insufficient evidence/)).toBeTruthy();
    expect(screen.getByText(/fewer than 20 events/)).toBeTruthy();
    expect(screen.getByText(/Observational, not causal/)).toBeTruthy();
    expect(mocks.api).toHaveBeenCalledWith('/api/admin/product-intelligence?days=90');
    expect(mocks.api).toHaveBeenCalledWith('/api/admin/recovery-outcomes?days=90');
  });
  it('keeps unrelated platform roles away from the content reporting UI', () => {
    mocks.role = 'security_admin';
    render(<PlatformOutcomeIntelligencePanel />);
    expect(screen.queryByRole('button', { name: 'View platform outcomes' })).toBeNull();
    expect(mocks.api).not.toHaveBeenCalled();
  });
});

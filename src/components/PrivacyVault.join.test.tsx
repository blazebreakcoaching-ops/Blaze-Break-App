import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The join screen must show the SERVER's reason when joining is refused
// (removed by an admin, unverified email, domain not approved, revoked
// invitation). secureApiFetch throws on any non-OK response, so a
// `!res.ok` branch never runs; the message has to come from the error.
const mocks = vi.hoisted(() => ({ secureApiFetch: vi.fn() }));
vi.mock('../lib/secure-api.ts', async () => {
  const actual = await vi.importActual<any>('../lib/secure-api.ts');
  return { ...actual, secureApiFetch: mocks.secureApiFetch };
});
vi.mock('../lib/firebase', () => ({ auth: { currentUser: { uid: 'u1', email: 'u1@test.dev' } } }));
vi.mock('../lib/firestore', () => ({ db: {} }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), setDoc: vi.fn() }));
vi.mock('../lib/audit-logger.ts', () => ({ getAuditLogs: vi.fn(async () => []), logAuditAction: vi.fn() }));
vi.mock('../lib/feature-flags.ts', () => ({ useFeatureFlags: () => ({}), setFeatureFlag: vi.fn() }));
vi.mock('./TrustCompliance.tsx', () => ({ TrustCompliance: () => null }));
vi.mock('./RetentionSchedule.tsx', () => ({ RetentionSchedule: () => null }));
vi.mock('./DataZoneVisualizer.tsx', () => ({ DataZoneVisualizer: () => null }));
vi.mock('./DataPrivacyDashboard.tsx', () => ({ DataPrivacyDashboard: () => null }));
vi.mock('./PrivacyPolicyAccordion.tsx', () => ({ PrivacyPolicyAccordion: () => null }));
vi.mock('./LegalDocumentsSection.tsx', () => ({ LegalDocumentsSection: () => null }));
vi.mock('./MemoryCentre.tsx', () => ({ MemoryCentre: () => null }));
vi.mock('./TeamClimateSurvey.tsx', () => ({ TeamClimateSurvey: () => null }));
vi.mock('./AnonymousSuggestionBox.tsx', () => ({ AnonymousSuggestionBox: () => null }));
vi.mock('./ConnectedRecoveryModules.tsx', () => ({ ConnectedNovaPermissions: () => null }));

const { SecureApiError } = await import('../lib/secure-api.ts');
const { PrivacyVault } = await import('./PrivacyVault');

beforeEach(() => {
  mocks.secureApiFetch.mockReset();
});

async function openJoinForm() {
  render(<PrivacyVault profile={{} as any} onProfileUpdate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /organisation/i }));
  return screen.findByPlaceholderText('Company code or email invitation code');
}

describe('Privacy Vault: joining a company', () => {
  it("shows the server's reason when an administrator removed this account", async () => {
    mocks.secureApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/org/me') return { ok: true, json: async () => ({ organisationId: null }) };
      throw new SecureApiError('Your access to this company was removed by an administrator. Ask them for a new personal invitation.', 403);
    });
    const input = await openJoinForm();
    fireEvent.change(input, { target: { value: 'ABCDEFGHJKLM' } });
    fireEvent.click(screen.getByRole('button', { name: /^join$/i }));
    expect(await screen.findByText(/Ask them for a new personal invitation/)).toBeTruthy();
  });

  it('falls back to a generic message for a non-API failure', async () => {
    mocks.secureApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/org/me') return { ok: true, json: async () => ({ organisationId: null }) };
      throw new Error('boom');
    });
    const input = await openJoinForm();
    fireEvent.change(input, { target: { value: 'ABCDEFGHJKLM' } });
    fireEvent.click(screen.getByRole('button', { name: /^join$/i }));
    expect(await screen.findByText('Could not join that organisation.')).toBeTruthy();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { uid: 'member-a' } as { uid: string } | null,
  api: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../lib/firebase', () => ({ auth: { get currentUser() { return mocks.user; } } }));
vi.mock('../lib/firestore', () => ({ db: {} }));
vi.mock('../lib/secure-api.ts', () => ({ secureApiFetch: mocks.api, SecureApiError: class extends Error {} }));
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
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), setDoc: vi.fn() }));
import { PrivacyVault } from './PrivacyVault';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { resolve, promise };
}
const response = (name: string) => ({ ok: true, json: async () => ({
  organisationId: 'org-' + name, organisationName: name, isOrgAdmin: false,
}) });
beforeEach(() => { mocks.user = { uid: 'member-a' }; mocks.api.mockReset(); });
describe('Organisation privacy session isolation', () => {
  it('does not restore an old organisation after switching accounts', async () => {
    const previous = deferred<ReturnType<typeof response>>();
    mocks.api.mockImplementation((path: string) => {
      if (path === '/api/org/me') {
        return mocks.user?.uid === 'member-a' ? previous.promise : Promise.resolve(response('New Organisation'));
      }
      return Promise.resolve({ ok: true, json: async () => ({ receipts: [] }) });
    });
    const { rerender } = render(<PrivacyVault profile={{} as any} onProfileUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /organisation/i }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('/api/org/me'));
    mocks.user = { uid: 'member-b' };
    rerender(<PrivacyVault profile={{} as any} onProfileUpdate={vi.fn()} />);
    expect(await screen.findByText(/New Organisation is currently sponsoring/)).toBeTruthy();
    await act(async () => { previous.resolve(response('Old Organisation')); });
    expect(screen.queryByText(/Old Organisation is currently sponsoring/)).toBeNull();
  });
});

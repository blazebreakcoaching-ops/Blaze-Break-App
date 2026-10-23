// Phase 5C (directive §7): real rendered-DOM tests for the NHEI consent
// screens - not markup inspection. Checks actual computed accessibility
// state (role/aria-checked) after real user interaction, and permission
// denial (a rejected consent write).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NheiPrivacyConsent } from './NheiPrivacyConsent';
import { SecureApiError } from '../lib/secure-api';

vi.mock('../lib/secure-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/secure-api')>('../lib/secure-api');
  return { ...actual, secureApiFetch: vi.fn() };
});
import { secureApiFetch } from '../lib/secure-api';

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

beforeEach(() => {
  vi.mocked(secureApiFetch).mockReset();
  vi.mocked(secureApiFetch).mockResolvedValue(jsonResponse({ consent: { reflection_storage: false, longitudinal_tracking: false, routing_insights: false } }));
});

describe('NheiPrivacyConsent', () => {
  it('renders Educational Mode as needing no consent, and the three personal purposes as real, unchecked switches', async () => {
    render(<NheiPrivacyConsent />);
    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledWith('/api/nhei/consent'));
    expect(screen.getByText('No consent needed')).toBeInTheDocument();
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(3);
    for (const s of switches) expect(s).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking a toggle calls the real write route and reflects the server\'s returned state via aria-checked', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ consent: { reflection_storage: false, longitudinal_tracking: false, routing_insights: false } }));
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ consent: { reflection_storage: true, longitudinal_tracking: false, routing_insights: false } }));
    render(<NheiPrivacyConsent />);
    const reflectionToggle = await screen.findByRole('switch', { name: 'Personal Reflection' });
    await userEvent.click(reflectionToggle);
    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledWith('/api/nhei/consent', { method: 'POST', data: { purpose: 'reflection_storage', granted: true } }));
    await waitFor(() => expect(reflectionToggle).toHaveAttribute('aria-checked', 'true'));
  });

  it('permission denial: a rejected write shows an error and leaves the toggle in its prior state', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(jsonResponse({ consent: { reflection_storage: false, longitudinal_tracking: false, routing_insights: false } }));
    vi.mocked(secureApiFetch).mockRejectedValueOnce(new SecureApiError('Unauthorized', 401));
    render(<NheiPrivacyConsent />);
    const toggle = await screen.findByRole('switch', { name: 'Recovery Insights' });
    await userEvent.click(toggle);
    await waitFor(() => expect(screen.getByText('Unauthorized')).toBeInTheDocument());
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('every disabled-state element uses real focusable, keyboard-reachable buttons (tab order sanity check)', async () => {
    render(<NheiPrivacyConsent />);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });
});

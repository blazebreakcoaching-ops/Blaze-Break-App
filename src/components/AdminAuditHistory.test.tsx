import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ secureApiFetch: vi.fn() }));
vi.mock('../lib/secure-api', () => ({ secureApiFetch: mocks.secureApiFetch }));

import { AdminAuditHistory } from './AdminAuditHistory';

const page = (logs: any[], nextCursor: string | null = null) =>
  ({ ok: true, json: async () => ({ logs, nextCursor, complete: !nextCursor }) });
const event = (id: string, action: string, actorEmail: string) => ({
  id, action, actorEmail, actorUid: null, actorRole: 'platform_owner', targetUid: 't', targetEmail: null,
  createdAt: '2026-01-01T00:00:00.000Z', outcome: 'succeeded', metadata: {},
});

beforeEach(() => {
  mocks.secureApiFetch.mockReset().mockResolvedValue(page([event('a', 'suspend_user', 'b@test.dev')], 'a'));
});

describe('Command Centre audit trail - full-history search', () => {
  it('searches by administrator across full history, keeps the filter while paging, and clears it', async () => {
    render(<AdminAuditHistory />);
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenCalledWith('/api/admin/audit-logs'));

    mocks.secureApiFetch.mockResolvedValueOnce(page([event('x', 'update_user_role', 'admin@test.dev')], 'x'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Audit search value' }), { target: { value: 'admin@test.dev' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenLastCalledWith('/api/admin/audit-logs?actor=admin%40test.dev'));
    expect(await screen.findByText(/the administrator is/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenLastCalledWith('/api/admin/audit-logs?cursor=x&actor=admin%40test.dev'));

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenLastCalledWith('/api/admin/audit-logs'));
  });

  it('normalises an action search to the stored action format', async () => {
    render(<AdminAuditHistory />);
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('combobox', { name: 'Search full history by' }), { target: { value: 'action' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Audit search value' }), { target: { value: 'Update User Role' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenLastCalledWith('/api/admin/audit-logs?action=update_user_role'));
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: { uid: 'test-user', isAnonymous: true }, logOut: vi.fn() }),
}));
vi.mock('../lib/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));
vi.mock('../lib/secure-api', () => ({
  secureApiFetch: vi.fn(),
}));
vi.mock('./NotificationSettingsView', () => ({ NotificationSettingsView: () => null }));
vi.mock('./FeatureFlagsView', () => ({ FeatureFlagsView: () => null }));
vi.mock('./FeedbackForm', () => ({ FeedbackForm: () => null }));
vi.mock('./SecuritySettingsView', () => ({ SecuritySettingsView: () => null }));
vi.mock('./NovaStyleControl', () => ({ NovaStyleControl: () => null }));

import { SettingsModal } from './SettingsModal';

const baseProfile = {
  fullName: 'Test Account', role: '', organization: '', managerEmail: '',
  letNovaLearn: true, useNameInGreetings: true,
};

describe('privacy controls show only confirmed saved state', () => {
  it('restores the last server-confirmed learning choice when a quick save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('offline'));
    render(<SettingsModal profile={baseProfile} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('tab', { name: /consent & privacy/i }));

    const learning = screen.getByRole('switch', { name: 'Behavioural Learning' });
    expect(learning).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(learning);
    expect(learning).toHaveAttribute('aria-checked', 'false');
    await waitFor(() => expect(learning).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('alert')).toHaveTextContent('not saved');
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ letNovaLearn: false }));
  });

  it('does not announce profile success or close Settings on a failed save', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error('permission-denied'));
    render(<SettingsModal profile={baseProfile} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not saved');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('retains a successful learning choice after server confirmation', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SettingsModal profile={baseProfile} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('tab', { name: /consent & privacy/i }));
    const learning = screen.getByRole('switch', { name: 'Behavioural Learning' });
    fireEvent.click(learning);
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(learning).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

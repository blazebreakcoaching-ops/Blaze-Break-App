import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { uid: 'account-A' } as { uid: string } | null,
  auth: { currentUser: { uid: 'account-A' } as { uid: string } | null },
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../lib/firebase', () => ({ auth: mocks.auth }));
vi.mock('../lib/firestore', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
}));

import { NotificationSettingsView } from './NotificationSettingsView';

type PreferencesSnapshot = { exists: () => boolean; data: () => Record<string, unknown> };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}
const snap = (notificationsEnabled: boolean): PreferencesSnapshot => ({
  exists: () => true,
  data: () => ({ notificationsEnabled, nudgeFrequency: 'low' }),
});

beforeEach(() => {
  mocks.user = { uid: 'account-A' };
  mocks.auth.currentUser = { uid: 'account-A' };
  mocks.getDoc.mockReset();
  mocks.setDoc.mockReset().mockResolvedValue(undefined);
});

describe('per-account notification preferences', () => {
  it('ignores account A loading late after account B signs in', async () => {
    const a = deferred<PreferencesSnapshot>();
    const b = deferred<PreferencesSnapshot>();
    mocks.getDoc.mockImplementation((ref: { path: string }) =>
      ref.path.includes('account-A') ? a.promise : b.promise);
    const view = render(<NotificationSettingsView />);

    mocks.user = { uid: 'account-B' };
    mocks.auth.currentUser = { uid: 'account-B' };
    view.rerender(<NotificationSettingsView />);
    await act(async () => { b.resolve(snap(true)); await b.promise; });
    expect(await screen.findByRole('checkbox', { name: 'Turn on in-app nudges' })).toBeChecked();

    await act(async () => { a.resolve(snap(false)); await a.promise; });
    expect(screen.getByRole('checkbox', { name: 'Turn on in-app nudges' })).toBeChecked();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('blocks saves on failed reads and offers a working retry', async () => {
    mocks.getDoc.mockRejectedValueOnce(new Error('offline'));
    render(<NotificationSettingsView />);
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load");
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    expect(mocks.setDoc).not.toHaveBeenCalled();

    mocks.getDoc.mockResolvedValueOnce(snap(false));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const save = await screen.findByRole('button', { name: 'Save Changes' });
    fireEvent.click(save);
    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/account-A/preferences/notifications' }),
      expect.objectContaining({ notificationsEnabled: false }),
      { merge: true },
    );
  });
});

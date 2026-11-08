import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'user-A' } as { uid: string } | null },
  setDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => path.join('/')),
}));
vi.mock('../lib/firebase', () => ({ auth: mocks.auth }));
vi.mock('../lib/firestore', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: mocks.doc, setDoc: mocks.setDoc, getDocs: vi.fn(async () => ({ docs: [] })),
  updateDoc: vi.fn(), deleteDoc: vi.fn(), query: vi.fn(), orderBy: vi.fn(), getDoc: vi.fn(),
}));
vi.mock('../lib/secure-api', () => ({ secureApiFetch: vi.fn() }));
vi.mock('../lib/nova-brain', () => ({ logJourney: vi.fn() }));

import { ConnectedDailyCheckIn } from './ConnectedRecoveryModules';

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'user-A' };
  mocks.setDoc.mockReset().mockResolvedValue(undefined);
  mocks.doc.mockClear();
});

const openQuick = () => fireEvent.click(screen.getByRole('button', { name: 'One-question check-in' }));

describe('one-question low-energy check-in (web)', () => {
  it('saves only the qualitative answer to the separate owner collection - no numbers, no score', async () => {
    const onComplete = vi.fn();
    render(<ConnectedDailyCheckIn onClose={vi.fn()} onComplete={onComplete} />);
    openQuick();
    fireEvent.click(screen.getByRole('button', { name: /I'm running low/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved. Thank you for checking in.');
    expect(mocks.setDoc).toHaveBeenCalledOnce();
    const [path, data] = mocks.setDoc.mock.calls[0];
    expect(path).toMatch(/^users\/user-A\/low_energy_checkins\/\d+$/);
    expect(data).toEqual({ createdAt: expect.any(String), response: 'low', kind: 'qualitative', source: 'user' });
    expect(Object.values(data).some((v) => typeof v === 'number')).toBe(false);
    // The numeric check-in callback (which feeds scores) is never called.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('a rapid double tap saves once', async () => {
    let resolve!: () => void;
    mocks.setDoc.mockImplementationOnce(() => new Promise<void>((r) => { resolve = r; }));
    render(<ConnectedDailyCheckIn onClose={vi.fn()} />);
    openQuick();
    const option = screen.getByRole('button', { name: /I'm managing/ });
    fireEvent.click(option);
    fireEvent.click(option);
    resolve();
    await screen.findByRole('status');
    expect(mocks.setDoc).toHaveBeenCalledOnce();
  });

  it('announces a save failure and lets the person try again', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('permission-denied'));
    render(<ConnectedDailyCheckIn onClose={vi.fn()} />);
    openQuick();
    fireEvent.click(screen.getByRole('button', { name: /I'm not sure/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
    fireEvent.click(screen.getByRole('button', { name: /I'm not sure/ }));
    await screen.findByRole('status');
    expect(mocks.setDoc).toHaveBeenCalledTimes(2);
  });

  it('is keyboard reachable and clearly labelled; skipping writes nothing', async () => {
    const onClose = vi.fn();
    render(<ConnectedDailyCheckIn onClose={onClose} />);
    openQuick();
    expect(screen.getByRole('heading', { name: 'How are you feeling right now?' })).toBeTruthy();
    for (const label of ["I'm doing okay", "I'm managing", "I'm running low", "I'm not sure"]) {
      const b = screen.getByRole('button', { name: new RegExp(label) });
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('type')).toBe('button');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('"Done" closes only after the confirmation', async () => {
    const onClose = vi.fn();
    render(<ConnectedDailyCheckIn onClose={onClose} />);
    openQuick();
    fireEvent.click(screen.getByRole('button', { name: /I'm doing okay/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PastNovaMemoriesReview } from './PastNovaMemoriesReview';

const mocks = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.currentUser }) }));
vi.mock('../lib/firebase', () => ({
  auth: { get currentUser() { return mocks.currentUser; } },
}));
vi.mock('../lib/firestore', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => segments.join('/')),
  doc: vi.fn((_db: unknown, ...segments: string[]) => segments.join('/')),
  getDocs: mocks.getDocs,
  updateDoc: mocks.updateDoc,
  deleteDoc: mocks.deleteDoc,
}));
const stored = (id: string) => ({
  docs: [{
    id,
    data: () => ({ type: 'profile', content: id, canEdit: true }),
  }],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { resolve, promise };
}

beforeEach(() => {
  mocks.currentUser = { uid: 'account-a' };
  mocks.getDocs.mockReset();
  mocks.updateDoc.mockReset().mockResolvedValue(undefined);
  mocks.deleteDoc.mockReset().mockResolvedValue(undefined);
});

describe('Past Nova Memories review login boundary', () => {
  it('discards a previous session review after same-UID reauthentication', async () => {
    const oldResult = deferred<ReturnType<typeof stored>>();
    mocks.getDocs.mockImplementationOnce(() => oldResult.promise);
    mocks.getDocs.mockResolvedValueOnce(stored('Fresh memory'));
    const { rerender } = render(<PastNovaMemoriesReview />);
    fireEvent.click(screen.getByRole('button', { name: 'Review saved memories' }));
    await waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(1));

    mocks.currentUser = { uid: 'account-a' };
    rerender(<PastNovaMemoriesReview />);
    fireEvent.click(screen.getByRole('button', { name: 'Review saved memories' }));
    expect(await screen.findByText('Fresh memory')).toBeInTheDocument();

    await act(async () => { oldResult.resolve(stored('Old memory')); });
    expect(screen.getByText('Fresh memory')).toBeInTheDocument();
    expect(screen.queryByText('Old memory')).not.toBeInTheDocument();
  });

  it('clears prior saved memory immediately when a different account takes over', async () => {
    mocks.getDocs.mockResolvedValueOnce(stored('Account A memory'));
    const { rerender } = render(<PastNovaMemoriesReview />);
    fireEvent.click(screen.getByRole('button', { name: 'Review saved memories' }));
    expect(await screen.findByText('Account A memory')).toBeInTheDocument();
    mocks.currentUser = { uid: 'account-b' };
    rerender(<PastNovaMemoriesReview />);
    await waitFor(() => expect(screen.queryByText('Account A memory')).not.toBeInTheDocument());
  });
});

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecondMemoryCard } from './SecondMemoryCard';

const mocks = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
  fetch: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.currentUser }) }));
vi.mock('../lib/firebase', () => ({
  auth: { get currentUser() { return mocks.currentUser; } },
}));
vi.mock('../lib/secure-api', () => ({ secureApiFetch: mocks.fetch }));

const response = (text: string) => ({
  json: async () => ({
    enabled: true,
    items: [{ id: text, text, status: 'open', updatedAt: '2026-11-09T00:00:00.000Z' }],
  }),
}) as unknown as Response;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { resolve, promise };
}

beforeEach(() => {
  mocks.currentUser = { uid: 'account-a' };
  mocks.fetch.mockReset();
});

describe('Second Memory same-UID session handoff', () => {
  it('refuses a late response from the prior session after reauthentication', async () => {
    const oldResponse = deferred<Response>();
    mocks.fetch.mockImplementationOnce(() => oldResponse.promise);
    mocks.fetch.mockResolvedValueOnce(response('New session note'));
    const { rerender } = render(<SecondMemoryCard />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));

    mocks.currentUser = { uid: 'account-a' }; // same UID; different session object
    rerender(<SecondMemoryCard />);
    expect(await screen.findByText('New session note')).toBeInTheDocument();
    await act(async () => { oldResponse.resolve(response('Old private note')); });

    expect(screen.getByText('New session note')).toBeInTheDocument();
    expect(screen.queryByText('Old private note')).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('clears displayed notes and does not issue a fresh request after sign-out', async () => {
    mocks.fetch.mockResolvedValue(response('Account A private note'));
    const { rerender } = render(<SecondMemoryCard />);
    expect(await screen.findByText('Account A private note')).toBeInTheDocument();
    mocks.currentUser = null;
    rerender(<SecondMemoryCard />);
    await waitFor(() => expect(screen.queryByText('Account A private note')).not.toBeInTheDocument());
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

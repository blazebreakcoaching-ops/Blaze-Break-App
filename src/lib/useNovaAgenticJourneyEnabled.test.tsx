import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';
import { secureApiFetch } from './secure-api';
import { useNovaAgenticJourneyEnabled } from './useNovaAgenticJourneyEnabled';

vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn() }));
vi.mock('./firebase', () => ({ auth: { currentUser: null } }));
vi.mock('./secure-api', () => ({ secureApiFetch: vi.fn() }));

let emitAuth: (user: User | null) => void;
const signedIn = (uid: string) => ({ uid } as User);
const response = (enabled: unknown): Response => ({
  ok: true,
  json: async () => ({ agenticJourneyEnabled: enabled }),
} as Response);
const delayed = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
};

function authTransition(user: User | null) {
  (auth as { currentUser: User | null }).currentUser = user;
  act(() => emitAuth(user));
}

beforeEach(() => {
  vi.clearAllMocks();
  (auth as { currentUser: User | null }).currentUser = null;
  vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
    emitAuth = callback as (user: User | null) => void;
    return () => {};
  });
});

describe('useNovaAgenticJourneyEnabled — fail-closed session boundary', () => {
  it('starts off and enables only after a signed-in user receives the authorised boolean', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(response(true));
    const { result } = renderHook(() => useNovaAgenticJourneyEnabled());
    expect(result.current).toBe(false);
    authTransition(signedIn('user_a'));
    await waitFor(() => expect(result.current).toBe(true));
    expect(secureApiFetch).toHaveBeenCalledWith('/api/nova/journey-config');
  });

  it('clears a previously enabled journey on sign-out', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(response(true));
    const { result } = renderHook(() => useNovaAgenticJourneyEnabled());
    authTransition(signedIn('user_a'));
    await waitFor(() => expect(result.current).toBe(true));
    authTransition(null);
    expect(result.current).toBe(false);
  });

  it('does not accept a delayed response after its user has signed out', async () => {
    const a = delayed();
    vi.mocked(secureApiFetch).mockReturnValueOnce(a.promise);
    const { result } = renderHook(() => useNovaAgenticJourneyEnabled());
    authTransition(signedIn('user_a'));
    authTransition(null);
    await act(async () => { a.resolve(response(true)); await a.promise; });
    expect(result.current).toBe(false);
  });

  it('ignores account A response after switching to account B', async () => {
    const a = delayed();
    vi.mocked(secureApiFetch).mockReturnValueOnce(a.promise).mockResolvedValueOnce(response(false));
    const { result } = renderHook(() => useNovaAgenticJourneyEnabled());
    authTransition(signedIn('user_a'));
    authTransition(signedIn('user_b'));
    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledTimes(2));
    await act(async () => { a.resolve(response(true)); await a.promise; });
    expect(result.current).toBe(false);
  });

  it('rejects malformed flags and non-success responses rather than enabling the journey', async () => {
    vi.mocked(secureApiFetch).mockResolvedValueOnce(response('true'))
      .mockResolvedValueOnce({ ok: false } as Response);
    const { result } = renderHook(() => useNovaAgenticJourneyEnabled());
    authTransition(signedIn('user_a'));
    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
    authTransition(signedIn('user_b'));
    await waitFor(() => expect(secureApiFetch).toHaveBeenCalledTimes(2));
    expect(result.current).toBe(false);
  });
});

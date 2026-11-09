import { beforeEach, describe, expect, it, vi } from 'vitest';

// These tests use two distinct Firebase User objects with the same UID as
// well as different UIDs: the guard protects a session, not just a string.
const state = vi.hoisted(() => ({
  currentUser: null as null | { uid: string; getIdToken: (refresh?: boolean) => Promise<string> },
  getAppCheckToken: vi.fn(async () => 'app-check'),
}));
vi.mock('./firebase', () => ({
  auth: { get currentUser() { return state.currentUser; } },
  getAppCheckToken: state.getAppCheckToken,
}));
vi.mock('./mfa-session', () => ({
  getMfaSessionToken: () => null,
  expireMfaSession: vi.fn(),
}));

(globalThis as any).window = { location: { origin: 'https://app.example.test' } };
import { secureApiFetch } from './secure-api';

const user = (uid: string) => ({ uid, getIdToken: vi.fn(async () => 'id-token') });
const fetchMock = vi.fn();

beforeEach(() => {
  state.currentUser = user('account-a');
  state.getAppCheckToken.mockClear();
  fetchMock.mockReset().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  (globalThis as any).fetch = fetchMock;
});

describe('secureApiFetch account-switch isolation', () => {
  it('serves a normal request when the Firebase session stays unchanged', async () => {
    const response = await secureApiFetch('/api/recovery/my-outcomes');
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never sends the request if identity changes during token acquisition', async () => {
    let releaseToken!: (value: string) => void;
    let tokenStarted!: () => void;
    const tokenEntered = new Promise<void>(resolve => { tokenStarted = resolve; });
    const tokenPending = new Promise<string>(resolve => { releaseToken = resolve; });
    const oldUser = user('account-a');
    oldUser.getIdToken.mockImplementationOnce(() => {
      tokenStarted();
      return tokenPending;
    });
    state.currentUser = oldUser;
    const pending = secureApiFetch('/api/recovery/my-outcomes');
    await tokenEntered;
    state.currentUser = user('account-b');
    releaseToken('old-account-token');
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discards an already-sent response after switching to another account', async () => {
    let completeRequest!: (response: Response) => void;
    let requestStarted!: () => void;
    const entered = new Promise<void>(resolve => { requestStarted = resolve; });
    const responsePending = new Promise<Response>(resolve => { completeRequest = resolve; });
    fetchMock.mockImplementationOnce(() => {
      requestStarted();
      return responsePending;
    });
    const pending = secureApiFetch('/api/recovery/my-outcomes');
    await entered;
    state.currentUser = user('account-b');
    completeRequest(new Response('{"sensitive":"account-a"}', { status: 200 }));
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a new Firebase session for the same UID rather than accepting a stale result', async () => {
    let completeRequest!: (response: Response) => void;
    let requestStarted!: () => void;
    const entered = new Promise<void>(resolve => { requestStarted = resolve; });
    fetchMock.mockImplementationOnce(() => {
      requestStarted();
      return new Promise<Response>(resolve => { completeRequest = resolve; });
    });
    const pending = secureApiFetch('/api/recovery/my-outcomes');
    await entered;
    state.currentUser = user('account-a'); // different Firebase User object
    completeRequest(new Response('{"sensitive":"old session"}', { status: 200 }));
    await expect(pending).rejects.toMatchObject({ status: 409 });
  });
});

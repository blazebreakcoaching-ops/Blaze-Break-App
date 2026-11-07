// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ state: { user: { uid: 'real-user' } as object | null, mfaPending: true, loading: false } }));
vi.mock('../lib/auth', () => ({ useAuth: () => auth.state }));
vi.mock('../App', () => ({ default: () => <div data-testid="protected-app">Protected app is mounted</div> }));
vi.mock('./MfaChallenge', () => ({ MfaChallenge: () => <div data-testid="mfa-challenge">2FA required</div> }));
import { AccountAccessGate } from './AccountAccessGate';

describe('MFA gate prevents protected App effects mounting', () => {
  it('does not mount App while second factor is pending', () => {
    auth.state = { user: { uid: 'real-user' }, mfaPending: true, loading: false };
    render(<AccountAccessGate />);
    expect(screen.getByTestId('mfa-challenge')).toBeTruthy();
    expect(screen.queryByTestId('protected-app')).toBeNull();
  });
  it('does not mount App while an existing account is still loading', () => {
    auth.state = { user: { uid: 'real-user' }, mfaPending: false, loading: true };
    render(<AccountAccessGate />);
    expect(screen.queryByTestId('protected-app')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });
  it('mounts App for a cleared authenticated session', () => {
    auth.state = { user: { uid: 'real-user' }, mfaPending: false, loading: false };
    render(<AccountAccessGate />);
    expect(screen.getByTestId('protected-app')).toBeTruthy();
  });
});

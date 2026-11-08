import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockVerify = jest.fn();
const mockLogOut = jest.fn();
jest.mock('../lib/auth-context', () => ({ useAuth: () => ({ verifyMfa: mockVerify, logOut: mockLogOut }) }));
jest.mock('../lib/native-theme', () => ({
  useNativeTheme: () => ({ colors: { background: '#000', text: '#fff', muted: '#aaa', subtle: '#888', border: '#333', danger: '#f00', accent: '#f60', onAccent: '#fff', input: '#111' } }),
}));

import { MfaChallengeScreen } from './MfaChallengeScreen';

const textOf = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
const pressByText = async (r: ReactTestRenderer, label: string) => {
  const target = r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
    .find((b) => b.findAll((x) => x.props.children === label).length > 0);
  if (!target) throw new Error(`No button labelled "${label}"`);
  await act(async () => { await target.props.onPress(); });
};

beforeEach(() => { mockVerify.mockReset(); mockLogOut.mockReset(); });

describe('MfaChallengeScreen', () => {
  it('submits the authenticator code and shows the reason when it is wrong', async () => {
    mockVerify.mockResolvedValue("That code didn't match. Check your authenticator app and try again.");
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<MfaChallengeScreen />); });
    const input = r.root.findAll((n) => n.props.accessibilityLabel === 'Six-digit authenticator code' && typeof n.props.onChangeText === 'function')[0];
    await act(async () => { input.props.onChangeText('000000'); });
    await pressByText(r, 'Verify');
    expect(mockVerify).toHaveBeenCalledWith('code', '000000');
    expect(textOf(r)).toContain("didn't match");
  });

  it('switches to a recovery code', async () => {
    mockVerify.mockResolvedValue(null);
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<MfaChallengeScreen />); });
    await pressByText(r, 'Use a recovery code instead');
    const input = r.root.findAll((n) => n.props.accessibilityLabel === 'Recovery code' && typeof n.props.onChangeText === 'function')[0];
    await act(async () => { input.props.onChangeText('abcd-efgh-1234'); });
    await pressByText(r, 'Verify');
    expect(mockVerify).toHaveBeenCalledWith('recovery', 'abcd-efgh-1234');
  });

  it('cancelling signs out (there is no way past without a verified code)', async () => {
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<MfaChallengeScreen />); });
    await pressByText(r, 'Cancel and sign out');
    expect(mockLogOut).toHaveBeenCalledTimes(1);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

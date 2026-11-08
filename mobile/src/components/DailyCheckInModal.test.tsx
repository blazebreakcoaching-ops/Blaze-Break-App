import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockSetDoc = jest.fn();
const mockAuth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'user-A' } };
jest.mock('../lib/firebase', () => ({ get auth() { return mockAuth; }, getDb: async () => ({}) }));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}));
jest.mock('../lib/secure-api', () => ({ secureApiFetch: jest.fn(async () => ({ ok: true })) }));
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('../lib/native-theme', () => ({
  useNativeTheme: () => ({ colors: { background: '#000', text: '#fff', muted: '#aaa', subtle: '#888', border: '#333', danger: '#f00', accent: '#f60', accentSoft: '#310', onAccent: '#fff', input: '#111', card: '#111' } }),
}));

import { DailyCheckInModal } from './DailyCheckInModal';

const buttons = (r: ReactTestRenderer) => r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
const press = async (r: ReactTestRenderer, label: string) => {
  const b = buttons(r).find((n) => n.props.accessibilityLabel === label || n.findAll((x) => x.props.children === label).length > 0);
  if (!b) throw new Error(`No button "${label}"`);
  await act(async () => { await b.props.onPress(); });
};

beforeEach(() => {
  mockSetDoc.mockReset().mockResolvedValue(undefined);
  mockAuth.currentUser = { uid: 'user-A' };
});

describe('native one-question check-in', () => {
  it('saves only the qualitative answer, announces it, and never reports numbers', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const onComplete = jest.fn();
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<DailyCheckInModal visible onClose={jest.fn()} onComplete={onComplete} />); });
    await press(r, 'One question check-in');
    await press(r, "I'm running low");
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [path, data] = mockSetDoc.mock.calls[0];
    expect(path).toMatch(/^users\/user-A\/low_energy_checkins\/\d+$/);
    expect(data).toEqual({ createdAt: expect.any(String), response: 'low', kind: 'qualitative', source: 'user' });
    expect(announce).toHaveBeenCalledWith('Saved. Thank you for checking in.');
    expect(onComplete).toHaveBeenCalledWith();
  });

  it('a double tap saves once', async () => {
    let resolve!: () => void;
    mockSetDoc.mockImplementationOnce(() => new Promise<void>((res) => { resolve = res; }));
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<DailyCheckInModal visible onClose={jest.fn()} onComplete={jest.fn()} />); });
    await press(r, 'One question check-in');
    const option = buttons(r).find((n) => n.props.accessibilityLabel === "I'm managing")!;
    await act(async () => { void option.props.onPress(); void option.props.onPress(); });
    await act(async () => { resolve(); });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it('a failed save is announced as an alert and nothing is reported complete', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'));
    const onComplete = jest.fn();
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<DailyCheckInModal visible onClose={jest.fn()} onComplete={onComplete} />); });
    await press(r, 'One question check-in');
    await press(r, "I'm not sure");
    const alert = r.root.findAll((n) => n.props.accessibilityRole === 'alert' && typeof n.props.children === 'string');
    expect(alert[0].props.children).toMatch(/Could not save/);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('every choice is a labelled button with a hint', async () => {
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<DailyCheckInModal visible onClose={jest.fn()} onComplete={jest.fn()} />); });
    await press(r, 'One question check-in');
    const labels = buttons(r).filter((n) => n.props.accessibilityHint === 'Save this private, qualitative check-in').map((n) => n.props.accessibilityLabel);
    expect([...new Set(labels)]).toEqual(["I'm doing okay", "I'm managing", "I'm running low", "I'm not sure"]);
  });
});

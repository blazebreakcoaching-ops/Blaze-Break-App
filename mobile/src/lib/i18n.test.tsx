import React from 'react';
import { act, create } from 'react-test-renderer';

let mockUser: { uid: string; isAnonymous: boolean } | null = null;
const mockRead = jest.fn();
jest.mock('./auth-context', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('./personal-profile', () => ({ readPersonalProfile: (uid: string) => mockRead(uid) }));

import { NativeI18nProvider, useNativeI18n, type NativeI18n } from './i18n';

let seen: NativeI18n | null = null;
function Probe() { seen = useNativeI18n(); return null; }

beforeEach(() => { mockRead.mockReset(); seen = null; mockUser = null; });

describe('native language provider', () => {
  it('applies the signed-in account\'s saved language, with RTL and a screen-reader tag', async () => {
    mockUser = { uid: 'u1', isAnonymous: false };
    mockRead.mockResolvedValue({ language: 'ur' });
    await act(async () => { create(<NativeI18nProvider><Probe /></NativeI18nProvider>); });
    expect(mockRead).toHaveBeenCalledWith('u1');
    expect(seen!.locale).toBe('ur');
    expect(seen!.dir).toBe('rtl');
    expect(seen!.tag).toBe('ur-PK');
    expect(seen!.t('auth.signIn')).toBe('سائن اِن کریں');
  });

  it('a failed read keeps the device language; guests never read an account', async () => {
    mockUser = { uid: 'u2', isAnonymous: false };
    mockRead.mockRejectedValue(new Error('offline'));
    await act(async () => { create(<NativeI18nProvider><Probe /></NativeI18nProvider>); });
    const deviceLocale = seen!.locale;
    expect(typeof deviceLocale).toBe('string');
    mockUser = { uid: 'anon', isAnonymous: true };
    mockRead.mockClear();
    await act(async () => { create(<NativeI18nProvider><Probe /></NativeI18nProvider>); });
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('switches instantly when the person picks a language', async () => {
    await act(async () => { create(<NativeI18nProvider><Probe /></NativeI18nProvider>); });
    await act(async () => { seen!.setLocale('zh'); });
    expect(seen!.t('checkin.low.question')).toBe('你现在感觉怎么样？');
    expect(seen!.dir).toBe('ltr');
  });
});

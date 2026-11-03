import { getAppCheckToken } from './app-check';

describe('native App Check graceful degradation', () => {
  it('resolves to an empty string rather than throwing when the native module is unavailable', async () => {
    // Jest's Node environment has no real @react-native-firebase native
    // binding (jest-expo does not mock it) - this is the exact
    // "Expo Go / no native build" case the module must survive without
    // crashing the caller. secure-api.ts relies on an empty string here
    // meaning "send the request without the App Check header", which the
    // server then correctly 401s rather than trusting a fabricated token.
    await expect(getAppCheckToken()).resolves.toBe('');
  });

  it('never rejects, even when called repeatedly (the failed init is memoized)', async () => {
    await expect(getAppCheckToken()).resolves.toBe('');
    await expect(getAppCheckToken(true)).resolves.toBe('');
  });
});

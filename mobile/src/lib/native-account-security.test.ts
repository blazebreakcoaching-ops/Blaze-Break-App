import { classifyNativeAccountSecurity } from './native-account-security';

describe('native security gate for web-MFA accounts', () => {
  it('blocks native access when server mfaEnabled custom claim is true', () => {
    expect(classifyNativeAccountSecurity(false, { mfaEnabled: true })).toBe('mfa_required');
  });
  it('does not block accounts that lack an MFA requirement', () => {
    expect(classifyNativeAccountSecurity(false, { mfaEnabled: false })).toBe('clear');
    expect(classifyNativeAccountSecurity(false, {})).toBe('clear');
    expect(classifyNativeAccountSecurity(true, { mfaEnabled: true })).toBe('clear');
  });
  it('fails closed on unknown token availability in the auth provider, not in this claim-only helper', () => {
    expect(classifyNativeAccountSecurity(false, { mfaEnabled: 'true' })).toBe('clear');
  });
});

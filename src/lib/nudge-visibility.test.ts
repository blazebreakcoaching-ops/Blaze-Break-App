import { describe, expect, it } from 'vitest';
import { isNudgeVisibleForAccount } from './nudge-visibility';

describe('account-scoped Nova reminder rendering', () => {
  it('shows an owned nudge when the right user is active and the page is quiet', () => {
    expect(isNudgeVisibleForAccount('account-a', 'account-a', true, false, false)).toBe(true);
  });

  it('never displays a previous account reminder after switching identities', () => {
    expect(isNudgeVisibleForAccount('account-b', 'account-a', true, false, false)).toBe(false);
  });

  it('does not display anything while an identity is unresolved', () => {
    expect(isNudgeVisibleForAccount(undefined, 'account-a', true, false, false)).toBe(false);
  });

  it('suppresses reminders during onboarding, guided help or dismissal', () => {
    expect(isNudgeVisibleForAccount('account-a', 'account-a', true, true, false)).toBe(false);
    expect(isNudgeVisibleForAccount('account-a', 'account-a', true, false, true)).toBe(false);
    expect(isNudgeVisibleForAccount('account-a', 'account-a', false, false, false)).toBe(false);
  });
});

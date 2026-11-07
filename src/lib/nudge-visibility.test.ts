import { describe, expect, it } from 'vitest';
import { isNudgeVisibleForAccount, nudgeHistoryKey, parseNudgeHistory, nudgeInteractionUpdate } from './nudge-visibility';

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

  it('keeps local reminder histories separate for different accounts', () => {
    expect(nudgeHistoryKey('account-a')).not.toBe(nudgeHistoryKey('account-b'));
    expect(nudgeHistoryKey('account a')).not.toBe(nudgeHistoryKey('account%20a'));
  });

  it('ignores broken or non-array history instead of throwing', () => {
    expect(parseNudgeHistory(null)).toEqual([]);
    expect(parseNudgeHistory('{bad')).toEqual([]);
    expect(parseNudgeHistory('{"shownAt":"2026-11-07"}')).toEqual([]);
    expect(parseNudgeHistory('null')).toEqual([]);
  });

  it('filters malformed items while retaining real timestamp records', () => {
    const valid = { shownAt: '2026-11-07T10:00:00.000Z' };
    expect(parseNudgeHistory(JSON.stringify([
      null, 4, 'fake', {}, { shownAt: 50 }, { shownAt: 'not a date' }, valid,
    ]))).toEqual([valid]);
  });

  it('limits retained records so storage cannot grow indefinitely', () => {
    const records = Array.from({ length: 150 }, (_, i) => ({
      shownAt: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
    }));
    const parsed = parseNudgeHistory(JSON.stringify(records));
    expect(parsed).toHaveLength(100);
    expect(parsed[0]).toEqual(records[50]);
  });

  it('records a CTA click as acted_on, without claiming task completion', () => {
    expect(nudgeInteractionUpdate('action_taken', '2026-11-07T09:00:00Z')).toEqual({
      status: 'acted_on',
      actionTakenAt: '2026-11-07T09:00:00Z',
      updatedAt: '2026-11-07T09:00:00Z',
    });
  });

  it('records closing a reminder as dismissed with a reason', () => {
    expect(nudgeInteractionUpdate('not_now', '2026-11-07T10:00:00Z')).toEqual({
      status: 'dismissed',
      dismissedAt: '2026-11-07T10:00:00Z',
      reasonCategory: 'not_now',
      updatedAt: '2026-11-07T10:00:00Z',
    });
  });

  it('suppresses reminders during onboarding, guided help or dismissal', () => {
    expect(isNudgeVisibleForAccount('account-a', 'account-a', true, true, false)).toBe(false);
    expect(isNudgeVisibleForAccount('account-a', 'account-a', true, false, true)).toBe(false);
    expect(isNudgeVisibleForAccount('account-a', 'account-a', false, false, false)).toBe(false);
  });
});

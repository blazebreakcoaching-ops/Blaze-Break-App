import { describe, it, expect } from 'vitest';
import {
  SMS_LIMITS,
  checkSmsQuota,
  estimateSmsSegments,
  smsGloballyEnabled,
  smsCategoryEnabled,
} from './sms-guardrails';

describe('checkSmsQuota', () => {
  it('a guardian_alert is always allowed by the aggregate cap, no matter how much SMS the account has already sent', () => {
    expect(checkSmsQuota('guardian_alert', 999, 999).allowed).toBe(true);
  });

  it('ally_nudge and manual_send are blocked once the daily limit is reached', () => {
    expect(checkSmsQuota('ally_nudge', SMS_LIMITS.perUserDailyLimit, 0)).toEqual({ allowed: false, reason: 'daily_limit_reached' });
    expect(checkSmsQuota('manual_send', SMS_LIMITS.perUserDailyLimit, 0)).toEqual({ allowed: false, reason: 'daily_limit_reached' });
  });

  it('ally_nudge and manual_send are blocked once the monthly limit is reached, even under the daily limit', () => {
    expect(checkSmsQuota('ally_nudge', 0, SMS_LIMITS.perUserMonthlyLimit)).toEqual({ allowed: false, reason: 'monthly_limit_reached' });
  });

  it('a usage count safely under both limits is allowed', () => {
    expect(checkSmsQuota('ally_nudge', 1, 1).allowed).toBe(true);
  });

  it('respects a custom limits config rather than only the module default', () => {
    expect(checkSmsQuota('manual_send', 5, 5, { perUserDailyLimit: 5, perUserMonthlyLimit: 100 }).allowed).toBe(false);
  });
});

describe('estimateSmsSegments', () => {
  it('a short plain-English message is one GSM-7 segment', () => {
    const result = estimateSmsSegments('Time for your afternoon energy check-in.');
    expect(result).toEqual({ segments: 1, encoding: 'GSM-7' });
  });

  it('a message at exactly the single-segment GSM-7 boundary is still one segment', () => {
    expect(estimateSmsSegments('a'.repeat(160)).segments).toBe(1);
  });

  it('a message one character past the GSM-7 boundary becomes multi-segment', () => {
    expect(estimateSmsSegments('a'.repeat(161)).segments).toBeGreaterThan(1);
  });

  it('a message containing emoji is estimated as UCS-2 with a much shorter segment length', () => {
    const result = estimateSmsSegments('Great job today! 🎉');
    expect(result.encoding).toBe('UCS-2');
  });

  it('a long UCS-2 message segments more aggressively than the same length in GSM-7', () => {
    const gsm7 = estimateSmsSegments('a'.repeat(200));
    const ucs2 = estimateSmsSegments('👍'.repeat(100)); // 200 chars long (surrogate pairs), non-GSM-7
    expect(ucs2.segments).toBeGreaterThan(gsm7.segments);
  });
});

describe('kill switches', () => {
  it('default on: unset, empty, or unexpected env values never disable SMS', () => {
    expect(smsGloballyEnabled(undefined)).toBe(true);
    expect(smsGloballyEnabled('')).toBe(true);
    expect(smsGloballyEnabled('yes')).toBe(true);
    expect(smsCategoryEnabled(undefined)).toBe(true);
  });

  it('only the exact string "false" turns a switch off', () => {
    expect(smsGloballyEnabled('false')).toBe(false);
    expect(smsCategoryEnabled('false')).toBe(false);
  });
});

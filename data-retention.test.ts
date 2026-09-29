import { describe, it, expect } from 'vitest';
import {
  evaluateRetentionAction,
  retentionSweepIsEnabled,
  RETENTION_INACTIVITY_MONTHS,
  RETENTION_WARNING_DAYS_BEFORE,
} from './data-retention';

const NOW = new Date('2027-01-01T00:00:00.000Z');

const isoMonthsBefore = (months: number, extraDays = 0): string => {
  const d = new Date(NOW.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return d.toISOString();
};

const isoDaysBefore = (days: number): string => {
  const d = new Date(NOW.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
};

describe('retentionSweepIsEnabled: kill switch — must default off, only "true" turns it on', () => {
  it('is disabled when unset', () => {
    expect(retentionSweepIsEnabled(undefined)).toBe(false);
  });
  it('is disabled for any value other than the exact string "true"', () => {
    expect(retentionSweepIsEnabled('1')).toBe(false);
    expect(retentionSweepIsEnabled('TRUE')).toBe(false);
    expect(retentionSweepIsEnabled('yes')).toBe(false);
  });
  it('is enabled only for "true"', () => {
    expect(retentionSweepIsEnabled('true')).toBe(true);
  });
});

describe('evaluateRetentionAction: active accounts must never be touched', () => {
  it('does nothing for an account active today', () => {
    expect(
      evaluateRetentionAction({ uid: 'u1', lastSignInTime: NOW.toISOString(), creationTime: NOW.toISOString(), retentionWarningSentAt: null }, NOW)
    ).toEqual({ action: 'none' });
  });

  it('does nothing for an account inactive well short of the warning threshold', () => {
    expect(
      evaluateRetentionAction(
        { uid: 'u1', lastSignInTime: isoMonthsBefore(6), creationTime: '2020-01-01T00:00:00.000Z', retentionWarningSentAt: null },
        NOW
      )
    ).toEqual({ action: 'none' });
  });
});

describe('evaluateRetentionAction: the warning', () => {
  it('warns an account exactly at the 30-days-before-12-months threshold with no prior warning', () => {
    const lastSignInTime = isoMonthsBefore(RETENTION_INACTIVITY_MONTHS, -RETENTION_WARNING_DAYS_BEFORE); // inactive exactly 11 months
    expect(
      evaluateRetentionAction({ uid: 'u1', lastSignInTime, creationTime: '2020-01-01T00:00:00.000Z', retentionWarningSentAt: null }, NOW)
    ).toEqual({ action: 'warn' });
  });

  it('warns an account inactive well past 12 months that was never warned (e.g. sweep was down for a while)', () => {
    expect(
      evaluateRetentionAction(
        { uid: 'u1', lastSignInTime: isoMonthsBefore(18), creationTime: '2020-01-01T00:00:00.000Z', retentionWarningSentAt: null },
        NOW
      )
    ).toEqual({ action: 'warn' });
  });

  it('does not re-warn an account that was already warned and the grace period has not elapsed', () => {
    expect(
      evaluateRetentionAction(
        {
          uid: 'u1',
          lastSignInTime: isoMonthsBefore(RETENTION_INACTIVITY_MONTHS, -5),
          creationTime: '2020-01-01T00:00:00.000Z',
          retentionWarningSentAt: isoDaysBefore(5),
        },
        NOW
      )
    ).toEqual({ action: 'none' });
  });
});

describe('evaluateRetentionAction: deletion', () => {
  it('deletes an account warned >=30 days ago that is still past the 12-month inactivity mark', () => {
    expect(
      evaluateRetentionAction(
        {
          uid: 'u1',
          lastSignInTime: isoMonthsBefore(RETENTION_INACTIVITY_MONTHS, 1),
          creationTime: '2020-01-01T00:00:00.000Z',
          retentionWarningSentAt: isoDaysBefore(RETENTION_WARNING_DAYS_BEFORE),
        },
        NOW
      )
    ).toEqual({ action: 'delete' });
  });

  it('does not delete if the warning was sent but 30 days have not yet elapsed, even past the 12-month mark', () => {
    expect(
      evaluateRetentionAction(
        {
          uid: 'u1',
          lastSignInTime: isoMonthsBefore(RETENTION_INACTIVITY_MONTHS, 1),
          creationTime: '2020-01-01T00:00:00.000Z',
          retentionWarningSentAt: isoDaysBefore(10),
        },
        NOW
      )
    ).toEqual({ action: 'none' });
  });

  it('never deletes without a prior warning, no matter how inactive the account is', () => {
    expect(
      evaluateRetentionAction(
        { uid: 'u1', lastSignInTime: isoMonthsBefore(36), creationTime: '2020-01-01T00:00:00.000Z', retentionWarningSentAt: null },
        NOW
      )
    ).toEqual({ action: 'warn' }); // warn first, never straight to delete
  });

  it('re-warns (not deletes) an account that signed back in after being warned, then went inactive again', () => {
    // Warned 13 months ago, but they signed in 11 months ago (after the
    // warning) and have been inactive since — the stale warning must not
    // count, and re-crossing the threshold should warn again, not delete.
    expect(
      evaluateRetentionAction(
        {
          uid: 'u1',
          lastSignInTime: isoMonthsBefore(RETENTION_INACTIVITY_MONTHS, -RETENTION_WARNING_DAYS_BEFORE),
          creationTime: '2020-01-01T00:00:00.000Z',
          retentionWarningSentAt: isoMonthsBefore(13),
        },
        NOW
      )
    ).toEqual({ action: 'warn' });
  });

  it('treats a sign-in after the warning as cancelling it entirely (account active again)', () => {
    expect(
      evaluateRetentionAction(
        {
          uid: 'u1',
          lastSignInTime: NOW.toISOString(),
          creationTime: '2020-01-01T00:00:00.000Z',
          retentionWarningSentAt: isoMonthsBefore(13),
        },
        NOW
      )
    ).toEqual({ action: 'none' });
  });
});

describe('evaluateRetentionAction: malformed input never triggers an action', () => {
  it('does nothing for an unparseable lastSignInTime and creationTime', () => {
    expect(
      evaluateRetentionAction({ uid: 'u1', lastSignInTime: 'not-a-date', creationTime: 'also-not-a-date', retentionWarningSentAt: null }, NOW)
    ).toEqual({ action: 'none' });
  });

  it('falls back to creationTime when lastSignInTime is null', () => {
    expect(
      evaluateRetentionAction({ uid: 'u1', lastSignInTime: null, creationTime: isoMonthsBefore(18), retentionWarningSentAt: null }, NOW)
    ).toEqual({ action: 'warn' });
  });
});

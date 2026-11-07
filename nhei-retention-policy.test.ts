// NHEI PHASE 3C-2A - SECTION 11: RETENTION POLICY TESTS
//
// Pure decision-logic tests only - nothing here touches Firestore, a
// cron job, or any live schedule. NHEI_RETENTION_SWEEP_ENABLED is
// asserted to be false throughout, since this phase activates nothing.

import { describe, it, expect } from 'vitest';
import {
  evaluateNheiRetentionAction,
  NHEI_RETENTION_SWEEP_ENABLED,
  PROPOSED_WITHDRAWAL_GRACE_PERIOD_DAYS,
  PROPOSED_WITHDRAWAL_WARNING_DAYS_BEFORE,
  type NheiRetentionCandidate,
} from './nhei-retention-policy';

describe('NHEI_RETENTION_SWEEP_ENABLED', () => {
  it('is hardcoded off - no automatic deletion schedule is active this phase', () => {
    expect(NHEI_RETENTION_SWEEP_ENABLED).toBe(false);
  });
});

function candidate(overrides: Partial<NheiRetentionCandidate> = {}): NheiRetentionCandidate {
  return { purposeWithdrawnAt: null, purposeCurrentlyGranted: true, warningAlreadySentAt: null, ...overrides };
}

describe('evaluateNheiRetentionAction', () => {
  const NOW = new Date('2026-06-01T00:00:00.000Z');

  it('does nothing while the purpose is currently granted, even if it was withdrawn long ago and re-granted since', () => {
    const result = evaluateNheiRetentionAction(
      candidate({ purposeCurrentlyGranted: true, purposeWithdrawnAt: '2025-01-01T00:00:00.000Z' }),
      NOW,
    );
    expect(result.action).toBe('none');
  });

  it('does nothing when the purpose was never withdrawn', () => {
    const result = evaluateNheiRetentionAction(candidate({ purposeCurrentlyGranted: false, purposeWithdrawnAt: null }), NOW);
    expect(result.action).toBe('none');
  });

  it('does nothing well before the warning threshold', () => {
    const withdrawnAt = new Date(NOW.getTime() - 5 * 86_400_000).toISOString(); // 5 days ago
    const result = evaluateNheiRetentionAction(candidate({ purposeCurrentlyGranted: false, purposeWithdrawnAt: withdrawnAt }), NOW);
    expect(result.action).toBe('none');
  });

  it('warns once inside the warning window, before the deletion threshold', () => {
    const daysAgo = PROPOSED_WITHDRAWAL_GRACE_PERIOD_DAYS - PROPOSED_WITHDRAWAL_WARNING_DAYS_BEFORE + 1;
    const withdrawnAt = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
    const result = evaluateNheiRetentionAction(candidate({ purposeCurrentlyGranted: false, purposeWithdrawnAt: withdrawnAt }), NOW);
    expect(result.action).toBe('warn');
  });

  it('does not re-warn if a warning was already sent after the withdrawal', () => {
    const withdrawnAt = new Date(NOW.getTime() - (PROPOSED_WITHDRAWAL_GRACE_PERIOD_DAYS - 5) * 86_400_000).toISOString();
    const warnedAt = new Date(NOW.getTime() - 1 * 86_400_000).toISOString(); // warned yesterday, after withdrawal
    const result = evaluateNheiRetentionAction(
      candidate({ purposeCurrentlyGranted: false, purposeWithdrawnAt: withdrawnAt, warningAlreadySentAt: warnedAt }),
      NOW,
    );
    expect(result.action).toBe('none');
  });

  it('warns again if the only prior warning predates this withdrawal (a re-grant then a fresh withdrawal resets the clock)', () => {
    const withdrawnAt = new Date(NOW.getTime() - (PROPOSED_WITHDRAWAL_GRACE_PERIOD_DAYS - 5) * 86_400_000).toISOString();
    const staleWarning = new Date(NOW.getTime() - 365 * 86_400_000).toISOString(); // a year-old warning, before this withdrawal
    const result = evaluateNheiRetentionAction(
      candidate({ purposeCurrentlyGranted: false, purposeWithdrawnAt: withdrawnAt, warningAlreadySentAt: staleWarning }),
      NOW,
    );
    expect(result.action).toBe('warn');
  });

  it('becomes eligible for deletion once the full grace period has elapsed', () => {
    const withdrawnAt = new Date(NOW.getTime() - (PROPOSED_WITHDRAWAL_GRACE_PERIOD_DAYS + 1) * 86_400_000).toISOString();
    const result = evaluateNheiRetentionAction(candidate({ purposeCurrentlyGranted: false, purposeWithdrawnAt: withdrawnAt }), NOW);
    expect(result.action).toBe('delete');
  });

  it('treats a malformed withdrawnAt timestamp conservatively as "none", never as grounds for deletion', () => {
    const result = evaluateNheiRetentionAction(candidate({ purposeCurrentlyGranted: false, purposeWithdrawnAt: 'not-a-date' }), NOW);
    expect(result.action).toBe('none');
  });

  it('a re-grant at any point before deletion fully cancels the countdown, even one day before the threshold', () => {
    const withdrawnAt = new Date(NOW.getTime() - (PROPOSED_WITHDRAWAL_GRACE_PERIOD_DAYS - 1) * 86_400_000).toISOString();
    const result = evaluateNheiRetentionAction(candidate({ purposeCurrentlyGranted: true, purposeWithdrawnAt: withdrawnAt }), NOW);
    expect(result.action).toBe('none');
  });
});

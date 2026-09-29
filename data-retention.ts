// Inactivity-based account retention — Option B from docs/DATA_RETENTION.md.
//
// Decision (recorded here and in docs/DATA_RETENTION.md): an account with
// no Firebase Auth sign-in for RETENTION_INACTIVITY_MONTHS is deleted, but
// only after a warning email goes out RETENTION_WARNING_DAYS_BEFORE days
// ahead of that, so a returning user only has to sign in once to cancel
// it. Active users and their trend data (Recovery Velocity Map, Habit
// Consistency Index, etc.) are completely unaffected — this only ever
// acts on accounts nobody has touched in almost a year.
//
// This file is pure decision logic, no Firestore/Auth I/O, so it's
// exhaustively unit-tested without an emulator — same split as
// guardian-alert.ts/sms-guardrails.ts. server.ts's
// processInactivityRetentionSweep() owns the actual I/O: it reads
// Firebase Auth's own lastSignInTime (already tracked natively — no new
// per-user activity tracking needed), maps every account through
// evaluateRetentionAction(), and acts on the result. Deletion reuses the
// exact same eraseUserAccount() routine the self-serve
// /api/user/delete-account endpoint uses, so there is only one deletion
// code path in the whole app to keep correct.

export const RETENTION_INACTIVITY_MONTHS = 12;
export const RETENTION_WARNING_DAYS_BEFORE = 30;

// Same off-by-default kill-switch pattern as NUDGE_SCHEDULER_ENABLED /
// NOVA_TOOLS_ENABLED (guardian-alert.ts). A scheduled job that deletes
// user accounts must never run just because the code merged — it has to
// be turned on deliberately, per environment, via an explicit env var.
export const retentionSweepIsEnabled = (raw: string | undefined): boolean =>
  raw === 'true';

const monthsBefore = (from: Date, months: number): Date => {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
};

const daysAfter = (from: Date, days: number): Date => {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

export interface RetentionCandidate {
  uid: string;
  // Firebase Auth metadata.lastSignInTime — falls back to creationTime for
  // an account that was created but never subsequently signed into again
  // (Auth sets lastSignInTime at creation too, so in practice this is
  // just defensive: pass creationTime through if lastSignInTime is ever
  // missing/unparseable rather than treating the account as "never
  // inactive").
  lastSignInTime: string | null;
  creationTime: string;
  // ISO timestamp written to users/{uid}.retentionWarningSentAt the last
  // time the warning email was sent, or null if it never has been (or
  // has been superseded — see the "stale warning" handling below).
  retentionWarningSentAt: string | null;
}

export type RetentionAction =
  | { action: 'none' }
  | { action: 'warn' }
  | { action: 'delete' };

// The one function that decides what happens to an account. Everything
// else in this file exists to support this. Deliberately conservative:
// any ambiguous or malformed input resolves to 'none' rather than risking
// an unwarranted deletion.
export const evaluateRetentionAction = (
  candidate: RetentionCandidate,
  now: Date = new Date()
): RetentionAction => {
  const lastActiveRaw = candidate.lastSignInTime || candidate.creationTime;
  const lastActive = new Date(lastActiveRaw);
  if (Number.isNaN(lastActive.getTime())) return { action: 'none' };

  const deletionThreshold = monthsBefore(now, RETENTION_INACTIVITY_MONTHS);
  // The point 30 days before the 12-month mark — inactivity crossing this
  // is when the warning goes out, so the account always gets a genuine
  // 30-day notice regardless of exactly when the sweep happens to run.
  const warningThreshold = daysAfter(deletionThreshold, RETENTION_WARNING_DAYS_BEFORE);

  // Equality with the threshold counts as "past it" (inclusive), not
  // "still active" — an account inactive for exactly 11 months should
  // warn, not wait one more tick.
  const stillActive = lastActive > warningThreshold;
  if (stillActive) return { action: 'none' };

  // A warning is only "current" if it was sent after the account's most
  // recent sign-in. If the user signed in again after being warned (the
  // whole point of the warning), that sign-in updates lastSignInTime and
  // the stale warning timestamp underneath it stops counting — so if they
  // later go inactive again, they get warned again rather than being
  // silently skipped straight to deletion.
  const warningIsCurrent =
    candidate.retentionWarningSentAt !== null &&
    new Date(candidate.retentionWarningSentAt) > lastActive;

  if (!warningIsCurrent) return { action: 'warn' };

  const warnedAt = new Date(candidate.retentionWarningSentAt as string);
  const graceElapsed = daysAfter(warnedAt, RETENTION_WARNING_DAYS_BEFORE) <= now;
  const pastDeletionThreshold = lastActive < deletionThreshold;

  if (graceElapsed && pastDeletionThreshold) return { action: 'delete' };

  // Warned, but the 30-day grace period since the warning hasn't actually
  // elapsed yet (e.g. the sweep only just started running after a gap) —
  // wait rather than delete early.
  return { action: 'none' };
};

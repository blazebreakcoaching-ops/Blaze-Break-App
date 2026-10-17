// NHEI PHASE 3C-2A - SECTION 11: RETENTION GOVERNANCE (PROPOSED, NOT ACTIVE)
//
// Pure decision logic only - no Firestore/Auth I/O, same split this
// codebase already uses for its one EXISTING retention sweep
// (data-retention.ts's evaluateRetentionAction, run by server.ts's
// processInactivityRetentionSweep). Nothing in this file is called by
// server.ts, a cron job, or any route - per instruction, no automatic
// deletion schedule is activated by this phase. This file exists so a
// future, SEPARATELY APPROVED phase has pure, already-tested decision
// logic to wire up, exactly the same "prepare but do not activate"
// pattern this phase has already used for createGeminiExtractionCaller
// and the authority-contract functions.
//
// Scope - the retention questions section 11 explicitly asks to cover:
//   * Personal reflection evidence (users/{uid}/nhei_evidence)
//   * Temporal relationships - only PERSISTED asserted-influence
//     relations have a retention question at all; SEQUENCE/COOCCURRENCE/
//     RECURRENCE are never stored (see nhei-persistence-service.ts's
//     readNheiTemporalView) - there is nothing to retain or delete for
//     those, they are recomputed fresh from whatever evidence exists.
//   * Correction history - NOT given an independent retention period
//     here: it is a subcollection of its parent evidence record, and
//     deleteNheiEvidenceRecord already cascades deletion to it (Phase
//     3A). Its retention is always exactly its parent evidence's
//     retention - a deliberate choice, not an oversight, since a
//     correction record is meaningless once the record it corrects is
//     gone.
//   * User-confirmed insights - evidence with confirmationState ===
//     'user_confirmed'. This file proposes NO special-cased longer
//     retention for these by default - inventing a longer period for
//     "things the user agreed with" would itself be an unreviewed
//     product decision; see OPEN_QUESTIONS below.
//   * Consent withdrawal - distinct from deletion (see
//     nhei-persistence-service.ts's withdrawNheiConsent, which still
//     never deletes anything on its own). This file proposes a grace
//     period after which ALREADY-COLLECTED data under a WITHDRAWN
//     purpose becomes eligible for proactive deletion, mirroring the
//     existing account-level "warn, then delete after N more days"
//     shape - but scoped to the NHEI subcollections only, not the whole
//     account.
//   * Account deletion - already correctly cascades today: NHEI's
//     collections are subcollections under users/{uid}, and the
//     existing eraseUserAccount()/recursiveDelete() routine the
//     self-serve delete-account endpoint already uses walks every
//     descendant at any depth (confirmed in Phase 2's delivery report).
//     Nothing new is needed here; this file does not touch that path.
//   * Feature-specific deletion - already implemented and available on
//     demand, not gated by any schedule: deleteNheiEvidenceRecord /
//     deleteAllNheiData (Phase 2). Not yet wired to a user-facing control
//     - that is separate UI/routing work, out of this phase's scope.

export const NHEI_RETENTION_SWEEP_ENABLED = false as const; // Hardcoded off - see file header. Not an env-var toggle yet, because no sweep exists to toggle.

// PROPOSED, not yet approved. Chosen to be short enough to be a genuine
// grace period (not indefinite-by-default, per instruction) while long
// enough that a user who withdraws by mistake, or means to re-grant
// shortly after, is not punished for a brief lapse.
export const PROPOSED_WITHDRAWAL_GRACE_PERIOD_DAYS = 90;
// Mirrors the existing account-level pattern's warning lead time
// (RETENTION_WARNING_DAYS_BEFORE in data-retention.ts), scaled down for a
// much shorter overall window.
export const PROPOSED_WITHDRAWAL_WARNING_DAYS_BEFORE = 14;

export interface NheiRetentionCandidate {
  purposeWithdrawnAt: string | null; // ISO timestamp the reflection_storage purpose was last set to false, or null if currently granted/never withdrawn
  purposeCurrentlyGranted: boolean; // the CURRENT state - may have been re-granted since withdrawal
  warningAlreadySentAt: string | null;
}

export type NheiRetentionAction =
  | { action: 'none' } // purpose currently granted, or never withdrawn - nothing to do
  | { action: 'warn' } // withdrawn, approaching the grace period boundary, not yet warned (or warning is stale - see below)
  | { action: 'delete' }; // withdrawn, grace period fully elapsed

const daysBetween = (a: Date, b: Date): number => Math.abs(a.getTime() - b.getTime()) / 86_400_000;

// Deliberately conservative, matching evaluateRetentionAction's own
// stated philosophy: any ambiguous or malformed input resolves to
// 'none' rather than risking an unwarranted deletion. A re-grant at any
// point before the sweep actually runs cancels the whole countdown -
// there is no "scheduled for deletion regardless" state here, matching
// "preserve distinct withdrawal and deletion behaviours" (section 9):
// withdrawing is reversible right up until deletion actually happens.
export function evaluateNheiRetentionAction(
  candidate: NheiRetentionCandidate,
  now: Date = new Date(),
): NheiRetentionAction {
  if (candidate.purposeCurrentlyGranted || !candidate.purposeWithdrawnAt) return { action: 'none' };

  const withdrawnAt = new Date(candidate.purposeWithdrawnAt);
  if (Number.isNaN(withdrawnAt.getTime())) return { action: 'none' };

  const daysSinceWithdrawal = daysBetween(now, withdrawnAt);
  const deletionThresholdDays = PROPOSED_WITHDRAWAL_GRACE_PERIOD_DAYS;
  const warningThresholdDays = deletionThresholdDays - PROPOSED_WITHDRAWAL_WARNING_DAYS_BEFORE;

  if (daysSinceWithdrawal >= deletionThresholdDays) return { action: 'delete' };

  if (daysSinceWithdrawal >= warningThresholdDays) {
    // Same "stale warning" idea as the account-level sweep: if a warning
    // was already sent AFTER this withdrawal happened, don't re-warn
    // every single sweep run between the warning and the deletion
    // threshold.
    if (candidate.warningAlreadySentAt) {
      const warnedAt = new Date(candidate.warningAlreadySentAt);
      if (!Number.isNaN(warnedAt.getTime()) && warnedAt >= withdrawnAt) return { action: 'none' };
    }
    return { action: 'warn' };
  }

  return { action: 'none' };
}

// Open questions this file deliberately does NOT answer on its own -
// each needs an explicit product/legal decision before
// NHEI_RETENTION_SWEEP_ENABLED could ever become true:
//   1. Is 90 days (±14-day warning) the right grace period, or should it
//      differ by purpose (reflection_storage vs longitudinal_tracking)?
//   2. Should a user-confirmed insight (confirmationState ===
//      'user_confirmed') get a longer retention window than general
//      evidence, given the user actively affirmed it? Proposed default
//      here: NO special case, same lifecycle as other evidence - but
//      this is a product decision, not something this file assumes.
//   3. Does any legal/compliance obligation require NHEI data to be
//      retained for a MINIMUM period regardless of withdrawal (e.g. an
//      audit trail requirement)? This file asserts NONE - no legal
//      minimum is claimed or assumed - and recommends a compliance
//      stakeholder confirm that explicitly rather than this phase
//      guessing at one.
//   4. Should withdrawal-triggered deletion be scoped per-purpose (only
//      the data tied to the WITHDRAWN purpose) or should withdrawing
//      reflection_storage alone also eventually affect longitudinal_
//      tracking-gated data (persisted influence assertions)? Proposed
//      default here: strictly per-purpose, matching how consent itself
//      already works independently per purpose (nhei-consent.ts).
export const NHEI_RETENTION_OPEN_QUESTIONS_COUNT = 4 as const; // kept in sync with the comment above; bump if a question is added or resolved

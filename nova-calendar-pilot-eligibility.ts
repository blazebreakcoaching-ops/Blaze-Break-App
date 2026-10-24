// Nova Calendar Protection — pilot eligibility gate (Phase 5J, directive §4).
//
// WHY THIS IS A SEPARATE, FIFTH LAYER, NOT A MERGE INTO AN EXISTING ONE:
// the execution contract already has four independent checks, each
// answering a different question:
//   1. CALENDAR_PROTECTION_EXECUTION_ENABLED (nova-calendar-protection-
//      service.ts) - "is real execution turned on for ANYONE, anywhere,
//      at all?" Hardcoded false. The master kill switch.
//   2. THIS FILE - "even if it were on, is THIS SPECIFIC ACCOUNT one of
//      the explicitly, individually chosen pilot accounts?"
//   3. The Google Calendar connector factory (nova-google-calendar-
//      connector-factory.ts) - "does this account have a live,
//      correctly-scoped, correctly-identified Google connection right
//      now?"
//   4. allowCalendarActions (nova-calendar-action-permission.ts) - "has
//      this user personally, affirmatively consented to Nova proposing/
//      executing calendar changes?"
//   5. The proposal's own approval (recordCalendarProtectionApproval/
//      executeCalendarProtectionProposal's fingerprint+TTL+supersession
//      checks) - "did this user approve THIS EXACT change, recently, and
//      has nothing superseded it since?"
// Collapsing pilot eligibility into any of the other four would blur a
// genuinely different question into one that already means something
// else - (4) is the user's OWN consent, a self-service toggle on their
// own account; pilot eligibility is the PLATFORM's decision about which
// accounts are in a controlled rollout at all, and is never user-
// self-service (there is no route anywhere that lets a user grant this
// to themselves - only the admin-only route in server.ts, gated by
// requireAdmin, can write it).
//
// "Avoid creating multiple overlapping feature flags without a clear
// precedence contract" (directive §4's own words): this is the ONE flag
// this phase adds, with an exact, documented position in the chain -
// checked in executeCalendarProtectionProposal immediately after the
// global kill switch and before every per-request check, so a reader
// never has to guess which of several similarly-named flags wins.
//
// FAIL CLOSED ON MISSING OR INCONSISTENT CONFIGURATION (directive §4's
// own words): unlike allowCalendarActions (which lives on the user's own
// settings document and the user can always recreate by re-granting),
// this is deliberately stored somewhere the user's own account can never
// write - a missing document, a malformed field, or a read error must
// never be read as "eligible," because the entire point of this gate is
// that eligibility is something the PLATFORM asserts, never something a
// request can imply by omission.
//
// DURING PHASE 5J ITSELF: granting pilot eligibility to any uid (which
// this phase does not do - PILOT-ELIGIBLE accounts are added only by a
// founder decision, through the admin route, never by this codebase)
// still authorises nothing - CALENDAR_PROTECTION_EXECUTION_ENABLED stays
// hardcoded false regardless, so layer 1 continues to make every
// execute/undo attempt report execution_disabled before this layer is
// ever reached. This file exists and is tested now specifically so that,
// on the day a founder decision flips the kill switch for a real pilot,
// this gate is already real, already reviewed, and already proven - not
// invented under time pressure at that moment.

export interface FirestoreDocLikeForPilotEligibility {
  get(): Promise<{ exists: boolean; data(): any }>;
  set(data: any, options?: { merge?: boolean }): Promise<any>;
}

export interface FirestoreLikeForPilotEligibility {
  collection(path: string): { doc(id: string): FirestoreDocLikeForPilotEligibility };
}

// Deliberately NOT under users/{uid}/nova_permissions (allowCalendarActions'
// own document) or anywhere else the user's own authenticated routes ever
// write - see this file's own header on why pilot eligibility must never
// be settable by the account it applies to. server.ts's admin route is the
// only writer.
function pilotEligibilityDoc(db: FirestoreLikeForPilotEligibility, uid: string): FirestoreDocLikeForPilotEligibility {
  return db.collection(`users/${uid}/platform_pilot_access`).doc('calendar_protection');
}

export interface CalendarProtectionPilotEligibilityState {
  eligible: boolean;
  grantedAt: string | null;
  grantedBy: string | null;
  revokedAt: string | null;
}

const NOT_ELIGIBLE: CalendarProtectionPilotEligibilityState = { eligible: false, grantedAt: null, grantedBy: null, revokedAt: null };

/**
 * Fails closed on every possible way this can go wrong: no document,
 * a document whose `eligible` field is anything other than the literal
 * `true`, or the read itself throwing - all three resolve to "not
 * eligible," never "eligible" and never a thrown error that some less
 * careful caller might swallow into an open-by-default behaviour.
 */
export async function getCalendarProtectionPilotEligibility(
  db: FirestoreLikeForPilotEligibility,
  uid: string,
): Promise<CalendarProtectionPilotEligibilityState> {
  if (typeof uid !== 'string' || uid.length === 0) return { ...NOT_ELIGIBLE };
  try {
    const snap = await pilotEligibilityDoc(db, uid).get();
    if (!snap.exists) return { ...NOT_ELIGIBLE };
    const data = snap.data() || {};
    if (data.eligible !== true) {
      // A doc that exists but is explicitly not eligible is different
      // from no doc at all - it may carry a real revokedAt from a prior
      // grant being withdrawn, which is worth surfacing for audit/
      // transparency even though the eligibility outcome is identical
      // (not eligible) either way.
      return { ...NOT_ELIGIBLE, revokedAt: typeof data.revokedAt === 'string' ? data.revokedAt : null };
    }
    return {
      eligible: true,
      grantedAt: typeof data.grantedAt === 'string' ? data.grantedAt : null,
      grantedBy: typeof data.grantedBy === 'string' ? data.grantedBy : null,
      revokedAt: null,
    };
  } catch {
    // A read error is exactly the "configuration... inconsistent" case
    // directive §4 names - never interpreted as eligible.
    return { ...NOT_ELIGIBLE };
  }
}

export const isCalendarProtectionPilotEligible = async (
  db: FirestoreLikeForPilotEligibility,
  uid: string,
): Promise<boolean> => (await getCalendarProtectionPilotEligibility(db, uid)).eligible;

/**
 * Admin-only write path (server.ts's own route enforces `requireAdmin`
 * before ever calling this - this function itself has no way to check
 * who is calling it, the same separation of concerns
 * setCalendarActionPermission already has from its own route's auth
 * check). `grantedBy` records the admin uid who made the decision, for
 * the same auditability reason every other admin grant in this codebase
 * logs who acted.
 */
export async function setCalendarProtectionPilotEligibility(
  db: FirestoreLikeForPilotEligibility,
  uid: string,
  eligible: boolean,
  grantedByAdminUid: string,
): Promise<CalendarProtectionPilotEligibilityState> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = eligible
    ? { eligible: true, grantedAt: now, grantedBy: grantedByAdminUid, revokedAt: null }
    : { eligible: false, revokedAt: now };
  await pilotEligibilityDoc(db, uid).set(patch, { merge: true });
  return getCalendarProtectionPilotEligibility(db, uid);
}

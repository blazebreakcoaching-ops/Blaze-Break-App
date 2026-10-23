// Nova Calendar Protection — external-action permission boundary (Phase
// 5D, directive §3).
//
// AUDIT FINDING THIS FILE EXISTS TO CLOSE: `allowCalendarSignals`
// (nova-brain.ts) authorises Nova to READ a user's calendar meeting load
// to compute pressure signals (calendar-workload-defence-engine.ts). It
// has never authorised anything to be WRITTEN to a calendar, and nothing
// in this codebase has ever treated it as if it did — but the Phase 5C
// `/api/nova/calendar-protection/propose` route reused it anyway, as "a
// practical proxy, not a verified check" (see its own header comment in
// server.ts). Directive §3's own words: "do not assume that read consent
// also authorises writes." This file is that separate authorisation.
//
// `allowCalendarActions` is stored on the same
// users/{uid}/nova_permissions/current document as `allowCalendarSignals`
// and NHEI's own consent fields, per this codebase's existing one-document-
// per-user convention (see nhei-consent.ts for the identical pattern).
// Unlike `allowCalendarSignals` — a low-sensitivity read signal that fails
// OPEN on a missing doc — this permission fails CLOSED: a missing doc,
// missing field, or read error must never be interpreted as granted,
// because granting it is a precondition for an external-action workflow,
// not a UI personalisation toggle.
//
// This permission gates PROPOSING a calendar-protection change at all, and
// is checked AGAIN, authoritatively, at execute time (server.ts's execute
// route) — a grant recorded when the proposal was prepared is not treated
// as still valid by the time execution is attempted, since the user could
// have withdrawn it in between. Real external execution stays disabled
// regardless (CALENDAR_PROTECTION_EXECUTION_ENABLED in
// nova-calendar-protection-service.ts), so granting this permission today
// authorises nothing that can actually reach a calendar — it exists so the
// authorisation boundary is real and tested before execution is ever
// turned on, not invented retroactively once it is.

export const CALENDAR_ACTION_PERMISSION_FIELD = 'allowCalendarActions';

export interface FirestoreDocLike {
  get(): Promise<{ exists: boolean; data(): any }>;
  set(data: any, options?: { merge?: boolean }): Promise<any>;
}

export interface FirestoreLikeForPermissions {
  collection(path: string): { doc(id: string): FirestoreDocLike };
}

function actionPermissionDoc(db: FirestoreLikeForPermissions, uid: string): FirestoreDocLike {
  return db.collection(`users/${uid}/nova_permissions`).doc('current');
}

export interface CalendarActionPermissionState {
  granted: boolean;
  grantedAt: string | null;
  withdrawnAt: string | null;
}

const NOT_GRANTED: CalendarActionPermissionState = { granted: false, grantedAt: null, withdrawnAt: null };

/** Fails closed: any missing doc, missing field, or non-`true` value reads as not granted. */
export async function getCalendarActionPermission(
  db: FirestoreLikeForPermissions,
  uid: string,
): Promise<CalendarActionPermissionState> {
  const snap = await actionPermissionDoc(db, uid).get();
  if (!snap.exists) return { ...NOT_GRANTED };
  const data = snap.data() || {};
  return {
    granted: data[CALENDAR_ACTION_PERMISSION_FIELD] === true,
    grantedAt: typeof data.allowCalendarActionsGrantedAt === 'string' ? data.allowCalendarActionsGrantedAt : null,
    withdrawnAt: typeof data.allowCalendarActionsWithdrawnAt === 'string' ? data.allowCalendarActionsWithdrawnAt : null,
  };
}

export const isCalendarActionPermissionGranted = async (
  db: FirestoreLikeForPermissions,
  uid: string,
): Promise<boolean> => (await getCalendarActionPermission(db, uid)).granted;

/**
 * Explicit, affirmative action only — this is never flipped implicitly by
 * granting `allowCalendarSignals` or by preparing/approving a proposal.
 * `grantedAt`/`withdrawnAt` are maintained so a user (or support) can see
 * exactly when the permission's state last changed — the "clear ...
 * withdrawal mechanism" directive §3 asks for.
 */
export async function setCalendarActionPermission(
  db: FirestoreLikeForPermissions,
  uid: string,
  granted: boolean,
): Promise<CalendarActionPermissionState> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = granted
    ? { [CALENDAR_ACTION_PERMISSION_FIELD]: true, allowCalendarActionsGrantedAt: now, allowCalendarActionsWithdrawnAt: null }
    : { [CALENDAR_ACTION_PERMISSION_FIELD]: false, allowCalendarActionsWithdrawnAt: now };
  await actionPermissionDoc(db, uid).set(patch, { merge: true });
  return getCalendarActionPermission(db, uid);
}

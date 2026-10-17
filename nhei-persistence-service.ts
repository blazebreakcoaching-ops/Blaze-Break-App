// NHEI PHASE 2 - FIRESTORE PERSISTENCE / CONSENT SERVICE
//
// The thin, consent-gated I/O layer Phase 1's pure engines never had and
// were never meant to have. Every exported function here takes a
// Firestore-like `db` as its first argument (dependency injection) rather
// than importing a live connection itself - the same "I/O at the edges"
// shape the rest of this codebase already uses (pure engine + separate
// service), and the reason this file is unit-testable with a plain
// in-memory fake instead of a real emulator or a mocked firebase-admin
// boot sequence.
//
// Structural safety properties, by construction rather than by
// convention:
//   * every collection path this file ever builds is `users/${uid}/...` -
//     there is no function anywhere in this file that can read or write
//     a Firestore path not scoped under one specific uid. Cross-user
//     access isn't merely checked; there's no code path that could
//     attempt it.
//   * every read and write of evidence or influence-relation data is
//     consent-gated BEFORE any Firestore call is made - an unconsented
//     caller produces zero reads, not a filtered result.
//   * "trusted" source types (EXTERNALLY_VERIFIED_EVENT, SYSTEM_OBSERVATION,
//     SYSTEM_HYPOTHESIS, USER_CONFIRMED_INTERPRETATION) are rejected by
//     default - a caller must explicitly opt in via
//     `allowSystemAuthoredSourceTypes`, which nothing in Phase 2 ever
//     does. No Phase 2 code path lets a user-supplied request body set
//     one of these by simply naming it.
//   * nothing written here ever carries a raw-text/content field - see
//     nhei-types.ts; this file persists exactly that content-free shape
//     plus three persistence-only fields (sourceRef, createdAt, updatedAt).
//
// Per the approval spec: Phase 2 builds this capability but does not wire
// it into any route, any UI, or Nova's live prompts. Nothing in server.ts
// imports this file yet - that wiring, if approved, is Phase 3+ work.

import {
  type NheiEvidenceRecord,
  type EvidenceSourceType,
  validateEvidenceRecord,
} from './nhei-types';
import {
  type NheiTemporalRelation,
  type NheiAssertedInfluence,
  buildTimeline,
  type TemporalTimelineEntry,
  deriveRecurrenceRelations,
  carryAssertedInfluence,
} from './nhei-temporal-engine';
import {
  type NheiConsentPurpose,
  type NheiConsentState,
  deriveNheiConsentState,
  isNheiPurposeConsented,
  NHEI_CONSENT_FIELD,
} from './nhei-consent';

// ---- Minimal Firestore surface this file depends on ----------------------
// Deliberately narrow - only the methods actually called below. Matches
// both the admin SDK and the client SDK's chaining shape closely enough
// that either a real `db` or a small in-memory fake satisfies it.

export interface FirestoreDocSnapshotLike {
  readonly id: string;
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface FirestoreQuerySnapshotLike {
  readonly docs: FirestoreDocSnapshotLike[];
}
export interface FirestoreDocRefLike {
  readonly id: string;
  get(): Promise<FirestoreDocSnapshotLike>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
}
export interface FirestoreCollectionRefLike {
  doc(id?: string): FirestoreDocRefLike;
  get(): Promise<FirestoreQuerySnapshotLike>;
}
export interface FirestoreLike {
  collection(path: string): FirestoreCollectionRefLike;
}

const nowIso = (): string => new Date().toISOString();

// ---- Consent ---------------------------------------------------------

const permissionsDocPath = (uid: string) => `users/${uid}/nova_permissions`;

// Fails CLOSED on any error - a transient read failure must never be
// treated as consent, which is the opposite of how the rest of
// nova-brain.ts's low-sensitivity permission reads are allowed to behave.
export async function getNheiConsent(db: FirestoreLike, uid: string): Promise<NheiConsentState> {
  try {
    const snap = await db.collection(permissionsDocPath(uid)).doc('current').get();
    return deriveNheiConsentState(snap.exists ? snap.data() : undefined);
  } catch {
    return deriveNheiConsentState(undefined);
  }
}

export async function setNheiConsent(
  db: FirestoreLike,
  uid: string,
  purpose: NheiConsentPurpose,
  granted: boolean,
): Promise<void> {
  const field = NHEI_CONSENT_FIELD[purpose];
  await db.collection(permissionsDocPath(uid)).doc('current').set(
    { [field]: granted, updatedAt: nowIso() },
    { merge: true },
  );
}

// "Do not assume consent withdrawal and deletion are equivalent." This
// function ONLY flips the flag so future reads/writes for this purpose
// stop. It never deletes anything already persisted - that is always a
// separate, explicit call to deleteNheiEvidenceRecord/deleteAllNheiData.
export async function withdrawNheiConsent(db: FirestoreLike, uid: string, purpose: NheiConsentPurpose): Promise<void> {
  await setNheiConsent(db, uid, purpose, false);
}

// ---- Evidence ----------------------------------------------------------

export interface NheiPersistedEvidenceRecord extends NheiEvidenceRecord {
  // Pointer only, by id - never the content it points at, and nothing in
  // this file (or any other Phase 2 file) ever dereferences it.
  sourceRef: { collection: string; docId: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type NheiWriteBlockedReason = 'consent_required' | 'invalid_record' | 'source_type_not_permitted' | 'not_found';

export type NheiWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: NheiWriteBlockedReason; errors?: string[] };

const SYSTEM_AUTHORED_SOURCE_TYPES: ReadonlySet<EvidenceSourceType> = new Set([
  'EXTERNALLY_VERIFIED_EVENT',
  'SYSTEM_OBSERVATION',
  'SYSTEM_HYPOTHESIS',
  'USER_CONFIRMED_INTERPRETATION',
]);

const evidenceCollectionPath = (uid: string) => `users/${uid}/nhei_evidence`;
const correctionsCollectionPath = (uid: string, evidenceId: string) => `users/${uid}/nhei_evidence/${evidenceId}/corrections`;
const relationsCollectionPath = (uid: string) => `users/${uid}/nhei_temporal_relations`;

export interface WriteNheiEvidenceOptions {
  sourceRef?: { collection: string; docId: string } | null;
  // Never set to true by anything in Phase 2. Exists so a deliberately
  // authorised future caller (e.g. a verified-event ingestion step with
  // its own separate authorisation) has a documented, explicit opt-in
  // rather than this restriction being silently workable around.
  allowSystemAuthoredSourceTypes?: boolean;
}

export async function writeNheiEvidence(
  db: FirestoreLike,
  uid: string,
  input: unknown,
  options: WriteNheiEvidenceOptions = {},
): Promise<NheiWriteResult<NheiPersistedEvidenceRecord>> {
  const consent = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consent, 'reflection_storage')) {
    return { ok: false, reason: 'consent_required' };
  }

  const validation = validateEvidenceRecord(input);
  if (!validation.ok || !validation.record) {
    return { ok: false, reason: 'invalid_record', errors: validation.errors };
  }
  const record = validation.record;

  if (SYSTEM_AUTHORED_SOURCE_TYPES.has(record.sourceType) && !options.allowSystemAuthoredSourceTypes) {
    return { ok: false, reason: 'source_type_not_permitted' };
  }

  const timestamp = nowIso();
  const persisted: NheiPersistedEvidenceRecord = {
    ...record,
    sourceRef: options.sourceRef ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.collection(evidenceCollectionPath(uid)).doc(record.id).set(persisted as unknown as Record<string, unknown>);
  return { ok: true, value: persisted };
}

// Internal, unchecked fetch - consent is the CALLER's responsibility.
// Never exported, so every real entry point into this file enforces its
// own consent gate before any read happens.
async function fetchEvidenceUnchecked(db: FirestoreLike, uid: string): Promise<NheiPersistedEvidenceRecord[]> {
  const snap = await db.collection(evidenceCollectionPath(uid)).get();
  return snap.docs.map((d) => d.data() as unknown as NheiPersistedEvidenceRecord);
}

// Returns [] - never an error, never a partial read - when reflection
// storage isn't consented. No Firestore call is made in that case at all.
export async function readNheiEvidence(db: FirestoreLike, uid: string): Promise<NheiPersistedEvidenceRecord[]> {
  const consent = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consent, 'reflection_storage')) return [];
  return fetchEvidenceUnchecked(db, uid);
}

async function setConfirmationState(
  db: FirestoreLike,
  uid: string,
  evidenceId: string,
  newState: 'user_confirmed' | 'user_disputed',
): Promise<NheiWriteResult<{ previousState: string | null }>> {
  const consent = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consent, 'reflection_storage')) return { ok: false, reason: 'consent_required' };

  const ref = db.collection(evidenceCollectionPath(uid)).doc(evidenceId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not_found' };
  const previous = snap.data() as Record<string, unknown>;
  const previousState = typeof previous.confirmationState === 'string' ? previous.confirmationState : null;

  await ref.update({ confirmationState: newState, updatedAt: nowIso() });

  // "Preserve correction history only where appropriately consented and
  // required" - only written at all when longitudinal tracking is
  // separately consented; otherwise the state changes in place with no
  // history kept, which is the honest default.
  if (isNheiPurposeConsented(consent, 'longitudinal_tracking') && previousState !== newState) {
    const correctionId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.collection(correctionsCollectionPath(uid, evidenceId)).doc(correctionId).set({
      previousConfirmationState: previousState,
      newConfirmationState: newState,
      changedAt: nowIso(),
    });
  }

  return { ok: true, value: { previousState } };
}

// Disputing never deletes the record - it is read-side exclusion
// (excludeDisputedInterpretations in nhei-types.ts, already applied by
// the Adaptive Behaviour engine) that keeps a disputed interpretation out
// of anything presented as a confirmed pattern, not removal of the record.
export const disputeNheiEvidence = (db: FirestoreLike, uid: string, evidenceId: string) =>
  setConfirmationState(db, uid, evidenceId, 'user_disputed');

export const confirmNheiEvidence = (db: FirestoreLike, uid: string, evidenceId: string) =>
  setConfirmationState(db, uid, evidenceId, 'user_confirmed');

// "Delete eligible NHEI personal data" - independent of consent state and
// independent of full account deletion (which already covers this via
// recursiveDelete, since this is a subcollection under users/{uid} - see
// the Phase 2 delivery report for the verification of that).
export async function deleteNheiEvidenceRecord(db: FirestoreLike, uid: string, evidenceId: string): Promise<void> {
  const correctionsSnap = await db.collection(correctionsCollectionPath(uid, evidenceId)).get();
  await Promise.all(correctionsSnap.docs.map((d) => db.collection(correctionsCollectionPath(uid, evidenceId)).doc(d.id).delete()));
  await db.collection(evidenceCollectionPath(uid)).doc(evidenceId).delete();
}

export async function deleteAllNheiData(db: FirestoreLike, uid: string): Promise<void> {
  const [evidenceSnap, relationsSnap] = await Promise.all([
    db.collection(evidenceCollectionPath(uid)).get(),
    db.collection(relationsCollectionPath(uid)).get(),
  ]);
  await Promise.all(evidenceSnap.docs.map((d) => deleteNheiEvidenceRecord(db, uid, d.id)));
  await Promise.all(relationsSnap.docs.map((d) => db.collection(relationsCollectionPath(uid)).doc(d.id).delete()));
}

// ---- Temporal relations -------------------------------------------------

// The only relation shape ever persisted. SEQUENCE/COOCCURRENCE/RECURRENCE
// are always recomputed fresh from already-consented evidence (see
// readNheiTemporalView below) rather than stored - they are fully
// derivable, so persisting them would be exactly the kind of duplicate,
// driftable record this codebase's existing patterns avoid.
export async function writeNheiAssertedInfluence(
  db: FirestoreLike,
  uid: string,
  assertion: NheiAssertedInfluence,
): Promise<NheiWriteResult<NheiTemporalRelation>> {
  const consent = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consent, 'longitudinal_tracking')) {
    return { ok: false, reason: 'consent_required' };
  }
  const records = await fetchEvidenceUnchecked(db, uid);
  const relation = carryAssertedInfluence(records, assertion);
  if (!relation) return { ok: false, reason: 'not_found' };

  const relationId = `${assertion.fromEventId}__${assertion.toEventId}__${assertion.relationType}`;
  await db.collection(relationsCollectionPath(uid)).doc(relationId).set({ ...relation, createdAt: nowIso() });
  return { ok: true, value: relation };
}

export interface NheiTemporalView {
  timeline: TemporalTimelineEntry[];
  relations: NheiTemporalRelation[];
}

// reflection_storage gates the whole view, since it is a view over
// evidence. Persisted asserted-influence relations are included only if
// longitudinal_tracking is ALSO consented - withdrawing that purpose alone
// (leaving reflection_storage on) hides previously asserted influences
// from this view without touching the underlying evidence at all.
export async function readNheiTemporalView(db: FirestoreLike, uid: string): Promise<NheiTemporalView | null> {
  const consent = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consent, 'reflection_storage')) return null;

  const records = await fetchEvidenceUnchecked(db, uid);
  const timeline = buildTimeline(records);
  const computed = deriveRecurrenceRelations(records);

  let persistedInfluences: NheiTemporalRelation[] = [];
  if (isNheiPurposeConsented(consent, 'longitudinal_tracking')) {
    const snap = await db.collection(relationsCollectionPath(uid)).get();
    persistedInfluences = snap.docs.map((d) => d.data() as unknown as NheiTemporalRelation);
  }

  return { timeline, relations: [...computed, ...persistedInfluences] };
}

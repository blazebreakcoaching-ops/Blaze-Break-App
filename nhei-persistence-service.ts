// NHEI PHASE 2/3A - FIRESTORE PERSISTENCE / CONSENT SERVICE
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

// Phase 3C-2B section 2: the transaction surface, matching the real
// Admin SDK's Transaction shape this codebase already uses elsewhere
// (server.ts's MFA lockout check and Work Design intervention-budget
// checks both use db.runTransaction(async (tx) => { const snap = await
// tx.get(ref); ... tx.set(ref, data); ... })). set/update/delete are
// synchronous and return void - exactly like the real SDK, they STAGE a
// write rather than applying it immediately; every staged write commits
// together, atomically, only if none of the documents this transaction
// READ were modified by anyone else before it commits. That is the
// actual mechanism this section's required invariant depends on - not
// application-level "check again and compensate" logic.
export interface FirestoreTransactionLike {
  get(ref: FirestoreDocRefLike): Promise<FirestoreDocSnapshotLike>;
  get(ref: FirestoreCollectionRefLike): Promise<FirestoreQuerySnapshotLike>;
  set(ref: FirestoreDocRefLike, data: Record<string, unknown>, options?: { merge?: boolean }): void;
  update(ref: FirestoreDocRefLike, data: Record<string, unknown>): void;
  delete(ref: FirestoreDocRefLike): void;
}

export interface FirestoreLike {
  collection(path: string): FirestoreCollectionRefLike;
  // Optional, not required, for backward compatibility with every
  // FirestoreLike fake written before this section existed (none of
  // which ever needed transactions) and with any future minimal fake
  // that genuinely has no transaction support. Every function in this
  // file that needs atomicity checks for this at runtime and falls back
  // to the Phase 3C-2A compensating-rollback behaviour when it is
  // absent - a real `db` (the actual Firebase Admin SDK) always has
  // this, so the fallback is only ever exercised by a deliberately
  // transaction-less test double. See the section-2 "unavoidable
  // limitations" note below each affected function for what the
  // fallback path does NOT guarantee that the transactional path does.
  //
  // Typed loosely (`tx: any`) at this boundary deliberately - the real
  // Admin SDK's Transaction type is far richer than FirestoreTransactionLike
  // (query cursors, aggregates, etc.), and TypeScript's structural check
  // of a NARROWER callback parameter against that richer real type fails
  // on variance grounds even though a real Transaction satisfies every
  // member FirestoreTransactionLike declares at runtime. Every actual
  // call site inside this file annotates its own callback parameter as
  // `(tx: FirestoreTransactionLike)` explicitly, so this file's own code
  // keeps full type-checking on what it calls on `tx` - only the
  // boundary against the real SDK (and any other caller's `db`) is
  // loosened.
  runTransaction?<T>(fn: (tx: any) => Promise<T>): Promise<T>;
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

// Phase 3A: "define an explicit allowlist of source collections that NHEI
// may reference." A sourceRef is a pointer by id, never dereferenced, but
// it is still DATA stored at rest - an unconstrained `collection: string`
// would let a careless or malicious caller record a pointer into any
// Firestore collection at all, which is itself a disclosure/confusion
// risk even without ever being dereferenced (e.g. a pointer dressed up to
// look like it references another user's document, or a collection this
// app doesn't even recognise). Restricting it to a known, closed set of
// collections that this app's own architecture already understands to be
// per-user content sources closes that off.
export const NHEI_ALLOWED_SOURCE_COLLECTIONS = [
  'checkins',
  'mood_pulses',
  'body_checkins',
  'wins',
  'weekly_reviews',
  'boundary_scripts',
  'boundary_outcomes',
  'nova_memories',
  'nova_voice_sessions',
  'recovery_fuel_logs',
  'anxiety_reset_events',
] as const;
export type NheiAllowedSourceCollection = (typeof NHEI_ALLOWED_SOURCE_COLLECTIONS)[number];

export const isAllowedNheiSourceCollection = (value: unknown): value is NheiAllowedSourceCollection =>
  typeof value === 'string' && (NHEI_ALLOWED_SOURCE_COLLECTIONS as readonly string[]).includes(value);

// Deliberately NOT a full Firestore path. Only a (collection, docId) pair
// drawn from the allowlist above - there is no field here that could ever
// be interpreted as an absolute path, a different user's uid segment, or
// a collection this app doesn't recognise. "Ensure source references
// cannot escape the authenticated user's authorised scope": the implied
// full path is always `users/${uid}/${collection}/${docId}` for exactly
// the uid the write is already scoped to (see buildSourceRefPath below) -
// there is no way to express a cross-user reference in this shape at all.
export interface NheiSourceRef {
  collection: NheiAllowedSourceCollection;
  docId: string;
}

const MAX_DOC_ID_LENGTH = 1500; // Firestore's own document id limit

export function isValidNheiSourceRef(value: unknown): value is NheiSourceRef {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isAllowedNheiSourceCollection(v.collection) &&
    typeof v.docId === 'string' &&
    v.docId.length > 0 &&
    v.docId.length <= MAX_DOC_ID_LENGTH &&
    !v.docId.includes('/') // a slash would make this look like a multi-segment path, not a single doc id
  );
}

// The full path a sourceRef implies, for whichever future, separately
// authorised phase actually dereferences it. Exported so that future
// dereferencing code builds the path the exact same way this file
// validates it - always scoped under the SAME uid the evidence record
// itself belongs to, never a path segment taken from the sourceRef data.
export const buildNheiSourceRefPath = (uid: string, ref: NheiSourceRef): string =>
  `users/${uid}/${ref.collection}/${ref.docId}`;

export interface NheiPersistedEvidenceRecord extends NheiEvidenceRecord {
  // Pointer only, by id, drawn from the allowlist above - never the
  // content it points at, and nothing in this file (or any other Phase 2
  // or Phase 3A file) ever dereferences it. See NHEI_ALLOWED_SOURCE_COLLECTIONS.
  sourceRef: NheiSourceRef | null;
  createdAt: string;
  updatedAt: string;
}

export type NheiWriteBlockedReason =
  | 'consent_required'
  | 'invalid_record'
  | 'source_type_not_permitted'
  | 'confirmation_state_not_settable_at_creation'
  | 'invalid_source_ref'
  | 'not_found';

export type NheiWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: NheiWriteBlockedReason; errors?: string[] };

const SYSTEM_AUTHORED_SOURCE_TYPES: ReadonlySet<EvidenceSourceType> = new Set([
  'EXTERNALLY_VERIFIED_EVENT',
  'SYSTEM_OBSERVATION',
  'SYSTEM_HYPOTHESIS',
  'USER_CONFIRMED_INTERPRETATION',
]);

// confirmationState values that represent a conclusion about evidence,
// never a plain unexamined report of it. Phase 3A: "verify that user
// confirmation states cannot be forged through future API requests."
// These may ONLY be reached via the dedicated disputeNheiEvidence /
// confirmNheiEvidence transition functions below (which ignore caller
// input entirely and set a fixed literal) - a plain writeNheiEvidence
// call can never create a record that is already confirmed or disputed
// on arrival, which is exactly the forgery path a future request-body-
// driven route could otherwise open.
const CONCLUSORY_CONFIRMATION_STATES = new Set(['user_confirmed', 'user_disputed']);

const evidenceCollectionPath = (uid: string) => `users/${uid}/nhei_evidence`;
const correctionsCollectionPath = (uid: string, evidenceId: string) => `users/${uid}/nhei_evidence/${evidenceId}/corrections`;
const relationsCollectionPath = (uid: string) => `users/${uid}/nhei_temporal_relations`;

// Phase 3A: "privileged classifications must be derived from a verified
// server-side authority, not merely a Boolean supplied by an external
// caller." SYSTEM_AUTHORITY_BRAND is a module-private Symbol, never
// exported. A JSON request body - from any route, present or future - can
// never contain a JavaScript Symbol: JSON has no syntax for one, and
// JSON.parse cannot produce one. So `{ [SYSTEM_AUTHORITY_BRAND]: true }`
// can only ever be constructed by code that imports this exact symbol
// value, which only this module's own grantNheiSystemAuthority function
// does - there is no way to forge a token by crafting request data, only
// by being trusted, in-process, hand-written server code that explicitly
// calls the grant function below. This replaces the old plain
// `allowSystemAuthoredSourceTypes?: boolean` flag, which a careless
// future route handler could have set simply by spreading req.body.
const SYSTEM_AUTHORITY_BRAND = Symbol('nhei:system-authority');

export interface NheiSystemAuthorityToken {
  readonly [SYSTEM_AUTHORITY_BRAND]: true;
  // A short, required, human-readable label naming WHO granted this and
  // why - never used for access control itself, only so a token shows up
  // meaningfully in logs/audits rather than as an opaque true/false.
  readonly grantedBy: string;
}

// The ONLY function in this codebase that can mint a token. Nothing in
// Phase 3A calls this - it exists so a later, separately-reviewed,
// genuinely server-verified caller (e.g. a real external-verification
// pipeline) has an explicit, auditable, non-boolean way to opt in,
// instead of this restriction being one stray `true` away from being
// silently bypassed.
export function grantNheiSystemAuthority(grantedBy: string): NheiSystemAuthorityToken {
  if (!grantedBy || typeof grantedBy !== 'string') {
    throw new Error('grantNheiSystemAuthority requires a non-empty grantedBy label for audit purposes.');
  }
  return { [SYSTEM_AUTHORITY_BRAND]: true, grantedBy };
}

function isValidSystemAuthorityToken(token: unknown): token is NheiSystemAuthorityToken {
  if (typeof token !== 'object' || token === null) return false;
  const t = token as Record<symbol, unknown> & Record<string, unknown>;
  return t[SYSTEM_AUTHORITY_BRAND] === true && typeof t.grantedBy === 'string' && t.grantedBy.length > 0;
}

export interface WriteNheiEvidenceOptions {
  sourceRef?: NheiSourceRef | null;
  // Replaces the old boolean flag - see NheiSystemAuthorityToken above.
  // Nothing in Phase 3A ever passes this.
  systemAuthority?: NheiSystemAuthorityToken;
}

// Phase 3C-2B section 2: a private sentinel class used ONLY to abort a
// transaction body deliberately (consent not held) - never thrown for a
// genuine Firestore error. Throwing inside a transaction callback aborts
// that attempt; the real Admin SDK (and the fake below) only AUTOMATICALLY
// retries on an actual version conflict, never on an application-thrown
// error - so this must never be confused with one. Checking
// `instanceof` after the transaction rejects is how writeNheiEvidence /
// setConfirmationState / writeNheiAssertedInfluence tell "we chose to
// stop" apart from "something actually went wrong," without parsing
// error messages.
class NheiConsentRevokedDuringTransaction extends Error {}
class NheiNotFoundDuringTransaction extends Error {}

export async function writeNheiEvidence(
  db: FirestoreLike,
  uid: string,
  input: unknown,
  options: WriteNheiEvidenceOptions = {},
): Promise<NheiWriteResult<NheiPersistedEvidenceRecord>> {
  // Everything that does not depend on live consent state is validated
  // BEFORE any transaction starts, so the transaction body - the part
  // that actually needs atomicity - stays minimal (one doc read, one doc
  // write), which keeps retry cost low under contention.
  const validation = validateEvidenceRecord(input);
  if (!validation.ok || !validation.record) {
    return { ok: false, reason: 'invalid_record', errors: validation.errors };
  }
  const record = validation.record;
  const hasSystemAuthority = isValidSystemAuthorityToken(options.systemAuthority);

  if (SYSTEM_AUTHORED_SOURCE_TYPES.has(record.sourceType) && !hasSystemAuthority) {
    return { ok: false, reason: 'source_type_not_permitted' };
  }

  // Even with system authority for the sourceType, a record cannot arrive
  // already confirmed/disputed - that transition only ever happens via
  // the dedicated functions below, so there is exactly one code path that
  // can ever produce it, not two.
  if (CONCLUSORY_CONFIRMATION_STATES.has(record.confirmationState)) {
    return { ok: false, reason: 'confirmation_state_not_settable_at_creation' };
  }

  if (options.sourceRef != null && !isValidNheiSourceRef(options.sourceRef)) {
    return { ok: false, reason: 'invalid_source_ref' };
  }

  const buildPersisted = (): NheiPersistedEvidenceRecord => {
    const timestamp = nowIso();
    return { ...record, sourceRef: options.sourceRef ?? null, createdAt: timestamp, updatedAt: timestamp };
  };

  // Phase 3C-2B section 2: the invariant is "no optional NHEI write may
  // successfully commit based on consent that has already been revoked
  // at the transaction's commit point." A real Firestore transaction
  // gives this directly: it reads the permissions doc as PART of the
  // transaction, so if that doc changes (e.g. a concurrent withdrawal
  // commits) before this transaction commits, Firestore detects the
  // conflict against what it READ and automatically retries the whole
  // callback - which re-reads consent, now sees it revoked, and aborts
  // cleanly. This is a property of the transaction engine itself, not
  // application logic re-checking after the fact - see the Phase 3C-2B
  // delivery report section 2 for why this is strictly stronger than
  // 3C-2A's compensating-rollback approach (which still exists below as
  // the documented fallback for a `db` with no transaction support at
  // all - the real Admin SDK always has one).
  if (db.runTransaction) {
    try {
      const persisted = await db.runTransaction(async (tx: FirestoreTransactionLike) => {
        const permSnap = await tx.get(db.collection(permissionsDocPath(uid)).doc('current'));
        const consent = deriveNheiConsentState(permSnap.exists ? permSnap.data() : undefined);
        if (!isNheiPurposeConsented(consent, 'reflection_storage')) throw new NheiConsentRevokedDuringTransaction();
        const toWrite = buildPersisted();
        tx.set(db.collection(evidenceCollectionPath(uid)).doc(record.id), toWrite as unknown as Record<string, unknown>);
        return toWrite;
      });
      return { ok: true, value: persisted };
    } catch (err) {
      if (err instanceof NheiConsentRevokedDuringTransaction) return { ok: false, reason: 'consent_required' };
      throw err;
    }
  }

  // ---- Fallback: no transaction support on this `db` (Phase 3C-2A shape) ----
  // Documented limitation, not silently accepted: this path has a real,
  // if narrow, window where a withdrawal landing strictly between the
  // write and the post-write re-check could - in a true multi-process
  // race - still be missed if the re-check itself races against a THIRD
  // concurrent operation. The transactional path above closes that
  // window structurally; this one only closes it by re-checking and
  // compensating, which is correct for every race this phase's own tests
  // construct (single additional concurrent writer) but is not a
  // mathematical guarantee under unbounded concurrency the way a real
  // transaction is. Never exercised by a real `db` - only by a
  // deliberately transaction-less test double.
  const consentBefore = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consentBefore, 'reflection_storage')) {
    return { ok: false, reason: 'consent_required' };
  }
  const persisted = buildPersisted();
  await db.collection(evidenceCollectionPath(uid)).doc(record.id).set(persisted as unknown as Record<string, unknown>);
  const consentAfterWrite = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consentAfterWrite, 'reflection_storage')) {
    await db.collection(evidenceCollectionPath(uid)).doc(record.id).delete();
    return { ok: false, reason: 'consent_required' };
  }
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
  // Phase 3C-2B section 2: consent read, evidence read, the state update,
  // and (when applicable) the correction-history write all happen inside
  // ONE transaction - every document this function's correctness depends
  // on is read and written atomically, so a concurrent withdrawal is
  // caught by the transaction engine itself, not by re-checking afterward.
  if (db.runTransaction) {
    try {
      const result = await db.runTransaction(async (tx: FirestoreTransactionLike) => {
        const permSnap = await tx.get(db.collection(permissionsDocPath(uid)).doc('current'));
        const consent = deriveNheiConsentState(permSnap.exists ? permSnap.data() : undefined);
        if (!isNheiPurposeConsented(consent, 'reflection_storage')) throw new NheiConsentRevokedDuringTransaction();

        const ref = db.collection(evidenceCollectionPath(uid)).doc(evidenceId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NheiNotFoundDuringTransaction();
        const previous = snap.data() as Record<string, unknown>;
        const previousState = typeof previous.confirmationState === 'string' ? previous.confirmationState : null;

        tx.update(ref, { confirmationState: newState, updatedAt: nowIso() });

        // Same "preserve correction history only where consented" rule as
        // before, decided from the SAME transactionally-read consent -
        // never a second, separately-racing read.
        if (isNheiPurposeConsented(consent, 'longitudinal_tracking') && previousState !== newState) {
          const correctionId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          tx.set(db.collection(correctionsCollectionPath(uid, evidenceId)).doc(correctionId), {
            previousConfirmationState: previousState,
            newConfirmationState: newState,
            changedAt: nowIso(),
          });
        }
        return { previousState };
      });
      return { ok: true, value: result };
    } catch (err) {
      if (err instanceof NheiConsentRevokedDuringTransaction) return { ok: false, reason: 'consent_required' };
      if (err instanceof NheiNotFoundDuringTransaction) return { ok: false, reason: 'not_found' };
      throw err;
    }
  }

  // ---- Fallback: no transaction support on this `db` ----
  // Same documented limitation as writeNheiEvidence's fallback above -
  // never exercised by a real `db`.
  const consent = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consent, 'reflection_storage')) return { ok: false, reason: 'consent_required' };

  const ref = db.collection(evidenceCollectionPath(uid)).doc(evidenceId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not_found' };
  const previous = snap.data() as Record<string, unknown>;
  const previousState = typeof previous.confirmationState === 'string' ? previous.confirmationState : null;

  await ref.update({ confirmationState: newState, updatedAt: nowIso() });

  const consentAfterWrite = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consentAfterWrite, 'reflection_storage')) {
    await ref.update({ confirmationState: previousState ?? 'not_applicable', updatedAt: nowIso() });
    return { ok: false, reason: 'consent_required' };
  }

  if (isNheiPurposeConsented(consentAfterWrite, 'longitudinal_tracking') && previousState !== newState) {
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

// Phase 3A: "identify any temporal relations referencing evidence that
// has been deleted. Define and test suitable handling for those
// references." Only PERSISTED relations can orphan this way -
// SEQUENCE/COOCCURRENCE/RECURRENCE are always recomputed fresh from
// whatever evidence currently exists (readNheiTemporalView), so a deleted
// record simply stops appearing in them with nothing left to clean up.
// Persisted asserted-influence relations are different: they are stored
// documents that name specific event ids, and those ids can go stale the
// moment the evidence they name is deleted. The handling chosen here is
// cascade deletion, not orphan-tolerant reads - a relation that claims an
// influence between two events is meaningless once one of those events no
// longer exists, and silently keeping it around risks a future reader
// treating a stale reference as if it still pointed at something real.
async function deleteRelationsReferencingEvidence(db: FirestoreLike, uid: string, evidenceId: string): Promise<void> {
  const snap = await db.collection(relationsCollectionPath(uid)).get();
  const stale = snap.docs.filter((d) => {
    const data = d.data() as Record<string, unknown> | undefined;
    return data?.fromEventId === evidenceId || data?.toEventId === evidenceId;
  });
  await Promise.all(stale.map((d) => db.collection(relationsCollectionPath(uid)).doc(d.id).delete()));
}

// "Delete eligible NHEI personal data" - independent of consent state and
// independent of full account deletion (which already covers this via
// recursiveDelete, since this is a subcollection under users/{uid} - see
// the Phase 2 delivery report for the verification of that).
export async function deleteNheiEvidenceRecord(db: FirestoreLike, uid: string, evidenceId: string): Promise<void> {
  const correctionsSnap = await db.collection(correctionsCollectionPath(uid, evidenceId)).get();
  await Promise.all(correctionsSnap.docs.map((d) => db.collection(correctionsCollectionPath(uid, evidenceId)).doc(d.id).delete()));
  await deleteRelationsReferencingEvidence(db, uid, evidenceId);
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
  const relationId = `${assertion.fromEventId}__${assertion.toEventId}__${assertion.relationType}`;

  // Phase 3C-2B section 2: consent, the evidence-existence check, and the
  // relation write all happen inside one transaction - see
  // writeNheiEvidence's comment above for why this closes the race
  // structurally rather than by re-checking afterward. The evidence
  // COLLECTION read here is not itself conflict-tracked the way the
  // single permissions document is (this fake/engine's conflict
  // detection is per-document) - an evidence record written concurrently
  // with this call is a pre-existing, documented limitation of
  // transacting over a collection query, not something this phase's fix
  // claims to close. The consent read is what actually matters for this
  // section's invariant, and that IS conflict-tracked.
  if (db.runTransaction) {
    try {
      const relation = await db.runTransaction(async (tx: FirestoreTransactionLike) => {
        const permSnap = await tx.get(db.collection(permissionsDocPath(uid)).doc('current'));
        const consent = deriveNheiConsentState(permSnap.exists ? permSnap.data() : undefined);
        if (!isNheiPurposeConsented(consent, 'longitudinal_tracking')) throw new NheiConsentRevokedDuringTransaction();

        const evidenceSnap = await tx.get(db.collection(evidenceCollectionPath(uid)));
        const records = evidenceSnap.docs.map((d) => d.data() as unknown as NheiPersistedEvidenceRecord);
        const relation = carryAssertedInfluence(records, assertion);
        if (!relation) throw new NheiNotFoundDuringTransaction();

        tx.set(db.collection(relationsCollectionPath(uid)).doc(relationId), { ...relation, createdAt: nowIso() });
        return relation;
      });
      return { ok: true, value: relation };
    } catch (err) {
      if (err instanceof NheiConsentRevokedDuringTransaction) return { ok: false, reason: 'consent_required' };
      if (err instanceof NheiNotFoundDuringTransaction) return { ok: false, reason: 'not_found' };
      throw err;
    }
  }

  // ---- Fallback: no transaction support on this `db` ----
  const consent = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consent, 'longitudinal_tracking')) {
    return { ok: false, reason: 'consent_required' };
  }
  const records = await fetchEvidenceUnchecked(db, uid);
  const relation = carryAssertedInfluence(records, assertion);
  if (!relation) return { ok: false, reason: 'not_found' };

  await db.collection(relationsCollectionPath(uid)).doc(relationId).set({ ...relation, createdAt: nowIso() });

  const consentAfterWrite = await getNheiConsent(db, uid);
  if (!isNheiPurposeConsented(consentAfterWrite, 'longitudinal_tracking')) {
    await db.collection(relationsCollectionPath(uid)).doc(relationId).delete();
    return { ok: false, reason: 'consent_required' };
  }

  return { ok: true, value: relation };
}

// ---- Export (GDPR Art. 15/20) -------------------------------------------
//
// Phase 3A: "confirm that nested correction-history records are included
// in user data export, or correct the export implementation where
// necessary." Checked against the REAL export endpoint
// (/api/user/export in server.ts): it calls `userRef.listCollections()`,
// which lists only the user document's DIRECT child collections, then
// `.get()`s each one - it does not recurse into a document's own
// subcollections. `users/{uid}/nhei_evidence` would be picked up that
// way, but `users/{uid}/nhei_evidence/{id}/corrections` is a
// subcollection of an EVIDENCE DOCUMENT, not of the user document, so it
// would be silently missed by that endpoint exactly as written today.
// (Account deletion does not have this problem: recursiveDelete walks
// every descendant at any depth, not just direct children - deletion and
// export are not symmetric here, which is exactly the kind of gap this
// phase was asked to check for rather than assume away.)
//
// This export function is the fix: it is correct on its own (it walks
// the nested corrections subcollection per evidence record explicitly)
// and is what server.ts's export endpoint should call for NHEI data once
// NHEI is wired into it - not currently done, since that wiring is itself
// route/integration work outside Phase 3A's scope (see the delivery
// report). Deliberately NOT consent-gated like the other read functions:
// a GDPR export request must return a user's data regardless of whether
// a given processing PURPOSE is currently consented to - withdrawing
// consent stops NEW processing, it does not forfeit the right to see
// what was already collected.
export interface NheiExportedEvidenceRecord {
  evidence: NheiPersistedEvidenceRecord;
  corrections: Record<string, unknown>[];
}

export interface NheiExportBundle {
  evidence: NheiExportedEvidenceRecord[];
  temporalRelations: Record<string, unknown>[];
}

export async function exportAllNheiData(db: FirestoreLike, uid: string): Promise<NheiExportBundle> {
  const evidenceSnap = await db.collection(evidenceCollectionPath(uid)).get();
  const evidence = await Promise.all(evidenceSnap.docs.map(async (d) => {
    const correctionsSnap = await db.collection(correctionsCollectionPath(uid, d.id)).get();
    return {
      evidence: d.data() as unknown as NheiPersistedEvidenceRecord,
      corrections: correctionsSnap.docs.map((c) => c.data() as Record<string, unknown>),
    };
  }));
  const relationsSnap = await db.collection(relationsCollectionPath(uid)).get();
  return {
    evidence,
    temporalRelations: relationsSnap.docs.map((d) => d.data() as Record<string, unknown>),
  };
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

// NHEI PHASE 3 CLOSURE §3 - IDEMPOTENT KNOWLEDGE-CONTENT IMPORT
//
// Audit finding this batch: NHEI_KNOWLEDGE_CONTENT_LIBRARY (9 entries,
// nhei-knowledge-content-library.ts) and NHEI_KNOWLEDGE_DRAFT_ENTRIES (4
// entries, nhei-knowledge-content-drafts.ts) are imported ONLY by test
// files - never by server.ts, a seed script, or any other production code
// path. The 13 entries do not exist as real nhei_knowledge_entries
// Firestore documents in any environment; "all 13 entries remain
// approvalStatus: 'draft'" (the prior release-blocker register's framing)
// was true only of in-memory TS objects exercised in tests, not of any
// real database state. A reviewer cannot inspect, approve, or reject a
// document that was never written.
//
// This file is the "idempotent, explicitly invoked administrative import
// mechanism" the directive asks for. It is explicitly invoked (a route
// calls it; nothing runs it automatically), and it never approves
// anything - every entry it creates goes through createDraftKnowledgeEntry
// (nhei-knowledge-service.ts), which forces approvalStatus:'draft',
// reviewerId:null, lastReviewedAt:null, contentVersion:1 regardless of
// what the source object claims, and which itself refuses to overwrite an
// existing document ('id_already_exists'). That existing guarantee is what
// makes this file's own "never silently overwrite a newer edited or
// reviewed version" requirement straightforward: this file never calls an
// update/set against an existing document at all, for any reason - it only
// ever creates an absent one. A document that already exists, in ANY
// state (still a fresh, untouched draft; edited; reviewed; approved;
// rejected), is left completely alone and reported, never written to.
//
// Author identity: each source entry already carries its own real
// authorId ('nhei_content_author_v1' for the library, same value for the
// drafts file - see each file's own header comment for why that identity
// is not a reviewer). This import preserves that authorId exactly as
// written, rather than re-stamping the invoking admin as author - the
// admin who runs this import is an OPERATOR of the mechanism, not the
// author of the content, and conflating the two would be inaccurate
// provenance. It also means the invoking admin remains free to review
// (approve/reject) any of these entries afterwards, since
// decideKnowledgeApproval's reviewer-is-author check compares against the
// content's real author, not whoever happened to run the import.

import { type NheiKnowledgeEntry } from './nhei-knowledge-types';
import { createDraftKnowledgeEntry, listAllKnowledgeEntriesForReview, type NheiKnowledgeWriteBlockedReason } from './nhei-knowledge-service';
import type { FirestoreLike } from './nhei-persistence-service';
import { NHEI_KNOWLEDGE_CONTENT_LIBRARY } from './nhei-knowledge-content-library';
import { NHEI_KNOWLEDGE_DRAFT_ENTRIES } from './nhei-knowledge-content-drafts';

export type NheiKnowledgeImportEntryOutcome =
  | { entryId: string; status: 'imported' }
  | { entryId: string; status: 'already_imported' }
  | { entryId: string; status: 'conflict_existing_entry_differs'; details: string[] }
  | { entryId: string; status: 'rejected_source_entry_invalid'; reason: NheiKnowledgeWriteBlockedReason; errors?: string[] };

export interface NheiKnowledgeImportReport {
  totalSourceEntries: number;
  imported: number;
  alreadyImported: number;
  conflicts: number;
  rejected: number;
  entries: NheiKnowledgeImportEntryOutcome[];
}

// Fields that describe actual CONTENT, not governance/review state. Used
// to decide whether a pre-existing document is "the same source entry,
// already imported" (safe no-op on retry) versus "something has diverged
// since" (a real conflict this function must report, never resolve by
// overwriting). Deliberately excludes approvalStatus/reviewerId/
// lastReviewedAt/contentVersion - those are exactly the fields a real
// review action is expected and allowed to change, and a changed review
// status is the specific case this import must never clobber.
const CONTENT_FIELDS: Array<keyof NheiKnowledgeEntry> = [
  'id', 'title', 'educationalSummary', 'detailedExplanation', 'topics',
  'learningObjective', 'selfSystems', 'dimensions', 'exampleScenarios',
  'reflectionQuestions', 'recoveryToolReferences', 'evidenceCategory',
  'sourceReferences', 'sourcePublicationInfo', 'safetyRestrictions',
  'ageGroup', 'authorId', 'perceivedReceivedSelfDistinctions',
];

function describeContentDivergence(existing: NheiKnowledgeEntry, source: NheiKnowledgeEntry): string[] {
  const diffs: string[] = [];
  for (const field of CONTENT_FIELDS) {
    const existingValue = JSON.stringify(existing[field]);
    const sourceValue = JSON.stringify(source[field]);
    if (existingValue !== sourceValue) {
      diffs.push(`${String(field)} differs from source (existing content may have been edited since import)`);
    }
  }
  return diffs;
}

async function importOneEntry(db: FirestoreLike, source: NheiKnowledgeEntry): Promise<NheiKnowledgeImportEntryOutcome> {
  const result = await createDraftKnowledgeEntry(db, source.authorId, source);

  // NOTE: every branch below re-checks `result.ok === false` inline,
  // rather than narrowing once via an early "if (result.ok) return" and
  // relying on that narrowing to persist into later statements - this
  // project's tsconfig does not enable strictNullChecks, and without it
  // TypeScript's control-flow narrowing does not carry a discriminated
  // union's exclusion forward past a separate if-block the way it would
  // under strict mode. Checking the discriminant directly in each
  // condition that needs it keeps this correct under this project's
  // actual compiler settings instead of only under stricter ones.
  if (result.ok === false && result.reason === 'id_already_exists') {
    // Safe-retry path: a prior import attempt (this call or an earlier
    // one) already created this document. Fetch it back through the
    // same read path a reviewer would use, and compare CONTENT fields
    // only - never governance fields, which this import never wrote and
    // never checks here, so an entry a reviewer already approved or
    // rejected is correctly reported as "already imported, nothing to
    // do" rather than a false conflict just because its approvalStatus
    // moved on since the import ran.
    const { entries } = await listAllKnowledgeEntriesForReview(db);
    const existing = entries.find((e) => e.id === source.id);
    if (!existing) {
      // Document exists but failed validation on read - cannot safely
      // compare content, so this is reported as a conflict rather than
      // silently assumed equal.
      return { entryId: source.id, status: 'conflict_existing_entry_differs', details: ['existing document could not be read back for comparison - inspect manually'] };
    }
    const diffs = describeContentDivergence(existing, source);
    if (diffs.length === 0) {
      return { entryId: source.id, status: 'already_imported' };
    }
    return { entryId: source.id, status: 'conflict_existing_entry_differs', details: diffs };
  }

  if (result.ok === false) {
    return { entryId: source.id, status: 'rejected_source_entry_invalid', reason: result.reason, errors: result.errors };
  }

  return { entryId: source.id, status: 'imported' };
}

// The one entry point a future admin route calls. Processes entries
// sequentially (not Promise.all) so one entry's id_already_exists
// read-back never races another entry's own create - each entry's
// collection path/document id is independent, so sequencing costs
// negligible latency against real safety value (this is an explicitly
// invoked, low-frequency administrative action, never a request-path
// operation with a latency budget).
export async function importKnowledgeContentLibrary(db: FirestoreLike): Promise<NheiKnowledgeImportReport> {
  const sourceEntries = [...NHEI_KNOWLEDGE_CONTENT_LIBRARY, ...NHEI_KNOWLEDGE_DRAFT_ENTRIES];
  const entries: NheiKnowledgeImportEntryOutcome[] = [];
  for (const source of sourceEntries) {
    entries.push(await importOneEntry(db, source));
  }
  return {
    totalSourceEntries: sourceEntries.length,
    imported: entries.filter((e) => e.status === 'imported').length,
    alreadyImported: entries.filter((e) => e.status === 'already_imported').length,
    conflicts: entries.filter((e) => e.status === 'conflict_existing_entry_differs').length,
    rejected: entries.filter((e) => e.status === 'rejected_source_entry_invalid').length,
    entries,
  };
}

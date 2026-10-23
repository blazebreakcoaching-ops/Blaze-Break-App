// NHEI PHASE 3 CLOSURE §3/§8 - IDEMPOTENT KNOWLEDGE-CONTENT IMPORT TESTS
//
// Covers the acceptance path §3 explicitly asks for: draft import →
// reviewer access (listAllKnowledgeEntriesForReview) → checklist →
// approval or rejection → cache invalidation → approved-only retrieval -
// using the REAL 13-entry content library/drafts, with synthetic-only
// review decisions (this suite never approves any of the real 13 entries,
// per the directive's explicit instruction).

import { describe, it, expect } from 'vitest';
import {
  importKnowledgeContentLibrary,
} from './nhei-knowledge-import-service';
import {
  listAllKnowledgeEntriesForReview,
  approveKnowledgeEntry,
  retrieveApprovedKnowledge,
} from './nhei-knowledge-service';
import { NHEI_KNOWLEDGE_CONTENT_LIBRARY } from './nhei-knowledge-content-library';
import { NHEI_KNOWLEDGE_DRAFT_ENTRIES } from './nhei-knowledge-content-drafts';
import type { FirestoreLike, FirestoreCollectionRefLike, FirestoreTransactionLike } from './nhei-persistence-service';
import type { NheiKnowledgeReviewChecklist } from './nhei-knowledge-governance';

// Same minimal fake used by nhei-knowledge-service.test.ts, including
// runTransaction support (approveKnowledgeEntry now requires it).
function createFakeFirestore(): FirestoreLike {
  const store = new Map<string, Record<string, unknown>>();
  function collection(path: string): FirestoreCollectionRefLike {
    return {
      doc(id?: string) {
        const docId = id ?? `auto_${Math.random().toString(36).slice(2, 10)}`;
        const key = `${path}/${docId}`;
        return {
          id: docId,
          async get() {
            const data = store.get(key);
            return { id: docId, exists: data !== undefined, data: () => data };
          },
          async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
            if (options?.merge && store.has(key)) store.set(key, { ...store.get(key), ...data });
            else store.set(key, { ...data });
          },
          async update(data: Record<string, unknown>) {
            if (!store.has(key)) throw new Error('no such document');
            store.set(key, { ...store.get(key), ...data });
          },
          async delete() { store.delete(key); },
        };
      },
      async get() {
        const prefix = `${path}/`;
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
          .map(([k, data]) => ({ id: k.slice(prefix.length), exists: true, data: () => data }));
        return { docs };
      },
    };
  }
  async function runTransaction<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T> {
    const tx: FirestoreTransactionLike = {
      get: ((ref: any) => ref.get()) as FirestoreTransactionLike['get'],
      set: (ref, data, options) => { void ref.set(data, options); },
      update: (ref, data) => { void ref.update(data); },
      delete: (ref) => { void ref.delete(); },
    };
    return fn(tx);
  }
  return { collection, runTransaction };
}

const FULL_CHECKLIST: NheiKnowledgeReviewChecklist = {
  noUnsupportedPsychologicalClaims: true,
  noUnnecessaryMedicalisation: true,
  noMisleadingCausation: true,
  noUnsupportedIdentityAssumptions: true,
  noExcessiveEmotionalAiDependence: true,
  appropriateForYouthLanguageWhereRelevant: true,
  noUnnecessarySensitiveDataCollection: true,
  noCulturalOrPhilosophicalBias: true,
};

describe('importKnowledgeContentLibrary', () => {
  it('imports all 13 real entries as drafts on a fresh database', async () => {
    const db = createFakeFirestore();
    const report = await importKnowledgeContentLibrary(db);

    expect(report.totalSourceEntries).toBe(13);
    expect(report.imported).toBe(13);
    expect(report.alreadyImported).toBe(0);
    expect(report.conflicts).toBe(0);
    expect(report.rejected).toBe(0);

    const { entries } = await listAllKnowledgeEntriesForReview(db);
    expect(entries.length).toBe(13);
    expect(entries.every((e) => e.approvalStatus === 'draft')).toBe(true);
    expect(entries.every((e) => e.reviewerId === null)).toBe(true);

    // Never auto-publishes: nothing is retrievable as approved content.
    const retrieval = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(retrieval.found).toBe(false);
  });

  it('is idempotent - retrying the import on an already-imported, untouched database reports already_imported, never a duplicate or an error', async () => {
    const db = createFakeFirestore();
    await importKnowledgeContentLibrary(db);
    const secondReport = await importKnowledgeContentLibrary(db);

    expect(secondReport.imported).toBe(0);
    expect(secondReport.alreadyImported).toBe(13);
    expect(secondReport.conflicts).toBe(0);
    expect(secondReport.rejected).toBe(0);

    const { entries } = await listAllKnowledgeEntriesForReview(db);
    expect(entries.length).toBe(13); // still exactly 13, nothing duplicated
  });

  it('never overwrites an entry a reviewer has already approved - a retry after review reports already_imported, approval survives untouched', async () => {
    const db = createFakeFirestore();
    await importKnowledgeContentLibrary(db);
    const someRealEntryId = NHEI_KNOWLEDGE_CONTENT_LIBRARY[0].id;

    // Synthetic-only review decision - this is a test fixture action, not
    // a real approval of real content (the directive's own distinction).
    const approval = await approveKnowledgeEntry(db, someRealEntryId, 'synthetic_test_reviewer', FULL_CHECKLIST);
    expect(approval.ok).toBe(true);

    const secondReport = await importKnowledgeContentLibrary(db);
    expect(secondReport.alreadyImported).toBe(13); // approved entries still "already imported", content unchanged
    expect(secondReport.conflicts).toBe(0);

    const afterEntries = (await listAllKnowledgeEntriesForReview(db)).entries;
    const afterApproval = afterEntries.find((e) => e.id === someRealEntryId)!;
    expect(afterApproval.approvalStatus).toBe('approved'); // import never reverted the review decision
    expect(afterApproval.reviewerId).toBe('synthetic_test_reviewer');
  });

  it('reports a clear conflict, and never overwrites, when an existing document\'s content has diverged from the source', async () => {
    const db = createFakeFirestore();
    const realEntry = NHEI_KNOWLEDGE_CONTENT_LIBRARY[0];
    // Simulate a document that was imported once, then hand-edited
    // directly in Firestore (bypassing this import) - its title now
    // differs from the current source constant.
    await db.collection('nhei_knowledge_entries').doc(realEntry.id).set({
      ...realEntry,
      title: 'A title someone edited by hand after import',
    });

    const report = await importKnowledgeContentLibrary(db);
    expect(report.conflicts).toBe(1);
    const conflictOutcome = report.entries.find((e) => e.entryId === realEntry.id)!;
    expect(conflictOutcome.status).toBe('conflict_existing_entry_differs');
    if (conflictOutcome.status === 'conflict_existing_entry_differs') {
      expect(conflictOutcome.details.some((d) => d.includes('title'))).toBe(true);
    }

    // The hand-edited title must survive untouched - never overwritten.
    const stored = (await db.collection('nhei_knowledge_entries').doc(realEntry.id).get()).data();
    expect(stored?.title).toBe('A title someone edited by hand after import');
  });

  it('the complete acceptance path: draft import -> reviewer access -> checklist -> approval -> cache invalidation -> approved-only retrieval (synthetic decision only)', async () => {
    const db = createFakeFirestore();
    await importKnowledgeContentLibrary(db);

    // Reviewer access: the dashboard read sees the full entry, including
    // taxonomy/sources/evidence category/safety fields, not a summary.
    const { entries } = await listAllKnowledgeEntriesForReview(db);
    const internalSelfEntry = entries.find((e) => e.topics.includes('INTERNAL_SELF'))!;
    expect(internalSelfEntry).toBeDefined();
    expect(internalSelfEntry.sourceReferences).toBeDefined();
    expect(internalSelfEntry.evidenceCategory).toBeDefined();
    expect(internalSelfEntry.safetyRestrictions).toBeDefined();
    expect(internalSelfEntry.approvalStatus).toBe('draft');

    // Before approval: nothing retrievable.
    const before = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(before.found).toBe(false);

    // Checklist -> approval (explicitly a synthetic test decision, not a
    // real review of the real content - never approve the real 13 for
    // real per the directive).
    const decision = await approveKnowledgeEntry(db, internalSelfEntry.id, 'synthetic_test_reviewer', FULL_CHECKLIST);
    expect(decision.ok).toBe(true);

    // Cache invalidation -> approved-only retrieval sees it immediately.
    const after = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(after.found).toBe(true);
    expect(after.entries.some((e) => e.id === internalSelfEntry.id)).toBe(true);
  });

  it('every real source entry is still draft/unauthored-by-a-reviewer - this suite never approves any of the real 13 entries for real', () => {
    // A self-check on this test file's own discipline: confirms the
    // source constants this suite imports are what the directive expects
    // (draft, unreviewed) before this suite ever touches them.
    const all = [...NHEI_KNOWLEDGE_CONTENT_LIBRARY, ...NHEI_KNOWLEDGE_DRAFT_ENTRIES];
    expect(all.length).toBe(13);
    expect(all.every((e) => e.approvalStatus === 'draft' && e.reviewerId === null)).toBe(true);
  });
});

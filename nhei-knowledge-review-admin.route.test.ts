// NHEI PHASE 3 CLOSURE §2/§8 - KNOWLEDGE-REVIEW ADMIN ROUTES, AT THE
// ACTUAL ROUTE BOUNDARY
//
// Covers the directive's explicit test requirements for this batch:
// unauthorised-reviewer rejection, self-approval rejection, cross-user
// access (an ordinary authenticated user with no grant at all), and the
// grant/revoke route's own Platform-Owner-only boundary. Uses the same
// supertest + mocked firebase-admin/auth pattern as
// admin-audit-logs.route.test.ts, extended so the mocked verifyIdToken can
// also return the nheiKnowledgeReviewer custom claim this batch adds.

process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));

// Mocked user directory: uid -> claims. authenticateFirebaseUser passes
// the full decoded token through as req.user, so every claim set here
// (role, nheiKnowledgeReviewer) is reachable exactly the way a real custom
// claim would be. mergeCustomClaims/removeCustomClaimKeys (the
// grant/revoke route under test) read via getAuth().getUser(uid) and
// write via setCustomUserClaims - both mocked below against the same
// in-memory directory, so a grant made mid-test is reflected on this
// user's NEXT verifyIdToken call, exactly like a real Firebase project
// (a new ID token picks up a claims change; an already-issued token does
// not) - tests that need this re-authenticate as the same uid after the
// grant for that reason, rather than expecting the earlier token to change.
const USERS: Record<string, { email: string; role?: string; nheiKnowledgeReviewer?: boolean }> = {
  owner_1: { email: 'owner@test.dev', role: 'platform_owner' },
  admin_1: { email: 'admin@test.dev', role: 'platform_admin' },
  reviewer_1: { email: 'reviewer1@test.dev', nheiKnowledgeReviewer: true },
  reviewer_2: { email: 'reviewer2@test.dev', nheiKnowledgeReviewer: true },
  plain_user_1: { email: 'plain1@test.dev' },
};

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => {
      const u = USERS[t];
      if (!u) throw new Error('unknown test uid');
      return { uid: t, email: u.email, role: u.role, nheiKnowledgeReviewer: u.nheiKnowledgeReviewer };
    },
    getUser: async (uid: string) => ({ customClaims: { role: USERS[uid]?.role, nheiKnowledgeReviewer: USERS[uid]?.nheiKnowledgeReviewer } }),
    setCustomUserClaims: async (uid: string, claims: any) => {
      if (!USERS[uid]) USERS[uid] = { email: `${uid}@test.dev` };
      USERS[uid].role = claims?.role;
      USERS[uid].nheiKnowledgeReviewer = claims?.nheiKnowledgeReviewer;
    },
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore } from './test/fake-firestore';
import { createDraftKnowledgeEntry } from './nhei-knowledge-service';
import { fakeDb } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const FULL_CHECKLIST = {
  noUnsupportedPsychologicalClaims: true,
  noUnnecessaryMedicalisation: true,
  noMisleadingCausation: true,
  noUnsupportedIdentityAssumptions: true,
  noExcessiveEmotionalAiDependence: true,
  appropriateForYouthLanguageWhereRelevant: true,
  noUnnecessarySensitiveDataCollection: true,
  noCulturalOrPhilosophicalBias: true,
};

function draftInput(id: string, authorId: string) {
  return {
    id, title: 'T', educationalSummary: 'S', detailedExplanation: 'D',
    topics: ['INTERNAL_SELF'], learningObjective: 'L', selfSystems: [], dimensions: [],
    exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
    evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
    safetyRestrictions: [], ageGroup: 'all_ages', perceivedReceivedSelfDistinctions: null,
    authorId,
  };
}

beforeEach(() => {
  resetStore();
  USERS.owner_1 = { email: 'owner@test.dev', role: 'platform_owner' };
  USERS.admin_1 = { email: 'admin@test.dev', role: 'platform_admin' };
  USERS.reviewer_1 = { email: 'reviewer1@test.dev', nheiKnowledgeReviewer: true };
  USERS.reviewer_2 = { email: 'reviewer2@test.dev', nheiKnowledgeReviewer: true };
  USERS.plain_user_1 = { email: 'plain1@test.dev' };
});

describe('POST /api/admin/users/:uid/nhei-knowledge-reviewer', () => {
  it('a Platform Owner can grant the reviewer claim without touching the target\'s existing role', async () => {
    const res = await request(app)
      .post('/api/admin/users/plain_user_1/nhei-knowledge-reviewer')
      .set(auth('owner_1'))
      .send({ grant: true });
    expect(res.status).toBe(200);
    expect(USERS.plain_user_1.nheiKnowledgeReviewer).toBe(true);
  });

  it('granting the reviewer claim to an existing platform_admin does not strip their admin role', async () => {
    const res = await request(app)
      .post('/api/admin/users/admin_1/nhei-knowledge-reviewer')
      .set(auth('owner_1'))
      .send({ grant: true });
    expect(res.status).toBe(200);
    expect(USERS.admin_1.role).toBe('platform_admin'); // unchanged
    expect(USERS.admin_1.nheiKnowledgeReviewer).toBe(true); // additive
  });

  it('a non-Platform-Owner (even a platform_admin) cannot grant the reviewer claim', async () => {
    const res = await request(app)
      .post('/api/admin/users/plain_user_1/nhei-knowledge-reviewer')
      .set(auth('admin_1'))
      .send({ grant: true });
    expect(res.status).toBe(403);
    expect(USERS.plain_user_1.nheiKnowledgeReviewer).toBeUndefined();
  });

  it('an ordinary user cannot grant themselves the reviewer claim', async () => {
    const res = await request(app)
      .post('/api/admin/users/plain_user_1/nhei-knowledge-reviewer')
      .set(auth('plain_user_1'))
      .send({ grant: true });
    expect(res.status).toBe(403);
  });

  it('a Platform Owner can revoke the claim', async () => {
    await request(app).post('/api/admin/users/reviewer_1/nhei-knowledge-reviewer').set(auth('owner_1')).send({ grant: true });
    const res = await request(app)
      .post('/api/admin/users/reviewer_1/nhei-knowledge-reviewer')
      .set(auth('owner_1'))
      .send({ grant: false });
    expect(res.status).toBe(200);
    expect(USERS.reviewer_1.nheiKnowledgeReviewer).toBeUndefined();
  });
});

describe('GET /api/admin/nhei-knowledge/entries', () => {
  it('a plain authenticated user with no reviewer grant is refused (cross-user access denial)', async () => {
    const res = await request(app).get('/api/admin/nhei-knowledge/entries').set(auth('plain_user_1'));
    expect(res.status).toBe(403);
  });

  it('a platform_owner with no reviewer grant is ALSO refused - holding platform_owner alone is not enough', async () => {
    const res = await request(app).get('/api/admin/nhei-knowledge/entries').set(auth('owner_1'));
    expect(res.status).toBe(403);
  });

  it('a granted reviewer can list entries of every status', async () => {
    await createDraftKnowledgeEntry(fakeDb as any, 'author1', draftInput('entry1', 'author1'));
    const res = await request(app).get('/api/admin/nhei-knowledge/entries').set(auth('reviewer_1'));
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: any) => e.id)).toEqual(['entry1']);
  });
});

describe('POST /api/admin/nhei-knowledge/entries/:entryId/review', () => {
  it('an unauthorised (non-reviewer) caller cannot approve or reject', async () => {
    await createDraftKnowledgeEntry(fakeDb as any, 'author1', draftInput('entry1', 'author1'));
    const res = await request(app)
      .post('/api/admin/nhei-knowledge/entries/entry1/review')
      .set(auth('plain_user_1'))
      .send({ decision: 'approve', checklist: FULL_CHECKLIST });
    expect(res.status).toBe(403);
  });

  it('a reviewer who is also the entry\'s author cannot approve their own content (self-approval rejection)', async () => {
    await createDraftKnowledgeEntry(fakeDb as any, 'reviewer_1', draftInput('entry1', 'reviewer_1'));
    const res = await request(app)
      .post('/api/admin/nhei-knowledge/entries/entry1/review')
      .set(auth('reviewer_1'))
      .send({ decision: 'approve', checklist: FULL_CHECKLIST });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('reviewer_is_author');
  });

  it('a granted reviewer who is not the author can approve with a complete checklist', async () => {
    await createDraftKnowledgeEntry(fakeDb as any, 'author1', draftInput('entry1', 'author1'));
    const res = await request(app)
      .post('/api/admin/nhei-knowledge/entries/entry1/review')
      .set(auth('reviewer_1'))
      .send({ decision: 'approve', checklist: FULL_CHECKLIST });
    expect(res.status).toBe(200);

    const listed = await request(app).get('/api/admin/nhei-knowledge/entries').set(auth('reviewer_1'));
    const entry = listed.body.entries.find((e: any) => e.id === 'entry1');
    expect(entry.approvalStatus).toBe('approved');
    expect(entry.reviewerId).toBe('reviewer_1');
  });

  it('rejects an incomplete checklist (checklist_incomplete), never silently approving', async () => {
    await createDraftKnowledgeEntry(fakeDb as any, 'author1', draftInput('entry1', 'author1'));
    const incomplete = { ...FULL_CHECKLIST, noCulturalOrPhilosophicalBias: false };
    const res = await request(app)
      .post('/api/admin/nhei-knowledge/entries/entry1/review')
      .set(auth('reviewer_1'))
      .send({ decision: 'approve', checklist: incomplete });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('checklist_incomplete');
  });

  it('two different granted reviewers racing on the same entry: one wins, the other gets entry_not_in_draft_state, never a silent overwrite', async () => {
    await createDraftKnowledgeEntry(fakeDb as any, 'author1', draftInput('entry1', 'author1'));
    const [a, b] = await Promise.all([
      request(app).post('/api/admin/nhei-knowledge/entries/entry1/review').set(auth('reviewer_1')).send({ decision: 'approve', checklist: FULL_CHECKLIST }),
      request(app).post('/api/admin/nhei-knowledge/entries/entry1/review').set(auth('reviewer_2')).send({ decision: 'reject' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 400]);
  });
});

describe('POST /api/admin/nhei-knowledge/import', () => {
  it('an unauthorised caller cannot trigger the import', async () => {
    const res = await request(app).post('/api/admin/nhei-knowledge/import').set(auth('plain_user_1'));
    expect(res.status).toBe(403);
  });

  it('a granted reviewer can run the import, and it only ever creates drafts', async () => {
    const res = await request(app).post('/api/admin/nhei-knowledge/import').set(auth('reviewer_1'));
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(13);

    const listed = await request(app).get('/api/admin/nhei-knowledge/entries').set(auth('reviewer_1'));
    expect(listed.body.entries.length).toBe(13);
    expect(listed.body.entries.every((e: any) => e.approvalStatus === 'draft')).toBe(true);
  });
});

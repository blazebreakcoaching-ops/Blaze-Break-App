import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the legal-document versioning + acceptance-tracking
// system: GET /api/legal/documents(/:docType) (public, no auth required -
// an anonymous visitor must be able to read Terms/Privacy before they
// have an account), POST /api/legal/documents/:docType/accept
// (authenticated, server-authoritative - a user can never forge
// acceptance for another user since the uid always comes from the
// verified auth token, never the request body), GET
// /api/legal/acceptance-status (which documents this user still needs to
// accept), and the admin-only POST /api/admin/legal/:docType/publish.

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : undefined }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, getDocRaw } from './test/fake-firestore';
import { DEFAULT_LEGAL_DOCUMENTS } from './legal-documents';

const OWNER = 'owner_1';
const USER_A = 'user_a';
const USER_B = 'user_b';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
});

describe('GET /api/legal/documents', () => {
  it('is publicly readable, no auth required, and lists every document type', async () => {
    const res = await request(app).get('/api/legal/documents');
    expect(res.status).toBe(200);
    const docTypes = res.body.documents.map((d: any) => d.docType);
    expect(docTypes).toEqual(expect.arrayContaining(['TERMS', 'PRIVACY', 'REFUND', 'ACCEPTABLE_USE', 'AI_NOTICE', 'COOKIE_NOTICE']));
  });

  it('falls back to the shipped default content before anything is published', async () => {
    const res = await request(app).get('/api/legal/documents/TERMS');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(DEFAULT_LEGAL_DOCUMENTS.TERMS.version);
    expect(res.body.content).toContain('Blaze Break');
  });

  it('rejects an unknown document type with 404', async () => {
    const res = await request(app).get('/api/legal/documents/NOT_A_REAL_DOC');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/legal/documents/:docType/accept', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/legal/documents/TERMS/accept').send({});
    expect(res.status).not.toBe(200);
  });

  it('records acceptance under the authenticated caller\'s own uid, never a client-supplied one', async () => {
    const res = await request(app).post('/api/legal/documents/TERMS/accept').set(auth(USER_A)).send({ userId: USER_B });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.version).toBe(DEFAULT_LEGAL_DOCUMENTS.TERMS.version);

    const ownAcceptance = getDocRaw(`users/${USER_A}/legal_acceptances/TERMS`);
    expect(ownAcceptance?.documentType).toBe('TERMS');
    expect(ownAcceptance?.version).toBe(DEFAULT_LEGAL_DOCUMENTS.TERMS.version);

    // The attempted "userId: USER_B" in the body must never redirect the
    // write to a different user's own record.
    const forgedAcceptance = getDocRaw(`users/${USER_B}/legal_acceptances/TERMS`);
    expect(forgedAcceptance).toBeUndefined();
  });

  it('rejects an unknown document type', async () => {
    const res = await request(app).post('/api/legal/documents/NOT_REAL/accept').set(auth(USER_A));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/legal/acceptance-status', () => {
  it('lists TERMS and PRIVACY as outstanding before acceptance', async () => {
    const res = await request(app).get('/api/legal/acceptance-status').set(auth(USER_A));
    expect(res.status).toBe(200);
    const outstandingTypes = res.body.outstanding.map((o: any) => o.docType);
    expect(outstandingTypes).toEqual(expect.arrayContaining(['TERMS', 'PRIVACY']));
  });

  it('no longer lists a document as outstanding once accepted', async () => {
    await request(app).post('/api/legal/documents/TERMS/accept').set(auth(USER_A));
    await request(app).post('/api/legal/documents/PRIVACY/accept').set(auth(USER_A));
    const res = await request(app).get('/api/legal/acceptance-status').set(auth(USER_A));
    const outstandingTypes = res.body.outstanding.map((o: any) => o.docType);
    expect(outstandingTypes).not.toContain('TERMS');
    expect(outstandingTypes).not.toContain('PRIVACY');
  });

  it('does not list a document that does not require acceptance (e.g. the cookie notice)', async () => {
    const res = await request(app).get('/api/legal/acceptance-status').set(auth(USER_A));
    const outstandingTypes = res.body.outstanding.map((o: any) => o.docType);
    expect(outstandingTypes).not.toContain('COOKIE_NOTICE');
  });
});

describe('POST /api/admin/legal/:docType/publish', () => {
  const validPayload = {
    title: 'Terms & Conditions',
    version: '0.2',
    effectiveDate: '2026-02-01',
    requiresAcceptance: true,
    materialChange: true,
    content: '# Updated Terms\n\nSomething changed.',
  };

  it('requires admin privileges', async () => {
    const res = await request(app).post('/api/admin/legal/TERMS/publish').set(auth(USER_A)).send(validPayload);
    expect(res.status).not.toBe(200);
  });

  it('an admin can publish a new version, and it becomes the current one served', async () => {
    const publishRes = await request(app).post('/api/admin/legal/TERMS/publish').set(auth(OWNER)).send(validPayload);
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.version).toBe('0.2');

    const getRes = await request(app).get('/api/legal/documents/TERMS');
    expect(getRes.status).toBe(200);
    expect(getRes.body.version).toBe('0.2');
    expect(getRes.body.content).toContain('Updated Terms');
  });

  it('rejects an invalid payload', async () => {
    const res = await request(app).post('/api/admin/legal/TERMS/publish').set(auth(OWNER)).send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  it('a previously-accepted version is no longer current after a new material version is published', async () => {
    await request(app).post('/api/legal/documents/TERMS/accept').set(auth(USER_A));
    await request(app).post('/api/admin/legal/TERMS/publish').set(auth(OWNER)).send(validPayload);

    const res = await request(app).get('/api/legal/acceptance-status').set(auth(USER_A));
    const outstandingTypes = res.body.outstanding.map((o: any) => o.docType);
    expect(outstandingTypes).toContain('TERMS');
  });
});

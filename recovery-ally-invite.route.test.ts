import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression coverage for three real, user-reported bugs in the Recovery
// Ally invite email (POST /api/ally/invite): the link wasn't a real
// clickable <a href>, it went out plain-text/unbranded (a spam signal),
// and it said "Someone you know" instead of the real inviter's name,
// which read as phishing to the recipient. See brevo-templates.test.ts
// for the template-builder-level coverage of the same fix.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.BREVO_API_KEY = 'brevo_test_key';
  process.env.APP_URL = 'https://app.blazebreak.example';
  return {};
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStore();
  process.env.APP_URL = 'https://app.blazebreak.example';
  fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('POST /api/ally/invite', () => {
  it('sends a real, clickable HTML link - never a bare unlinked URL', async () => {
    seedDoc('users/person_1', { displayName: 'Jordan Lee' });
    const res = await request(app).post('/api/ally/invite').set(auth('person_1')).send({ allyEmail: 'friend@example.com' });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.to).toEqual([{ email: 'friend@example.com' }]);
    expect(body.htmlContent).toMatch(/<a href="https:\/\/app\.blazebreak\.example\/ally\/[a-f0-9]+"/);
    expect(body.textContent).toBeTruthy();
  });

  it('uses the real inviter name from their profile, never the generic "Someone you know"', async () => {
    seedDoc('users/person_1', { displayName: 'Jordan Lee' });
    await request(app).post('/api/ally/invite').set(auth('person_1')).send({ allyEmail: 'friend@example.com' });

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.subject).toContain('Jordan Lee');
    expect(body.htmlContent).toContain('Jordan Lee');
    expect(body.htmlContent.toLowerCase()).not.toContain('someone you know');
  });

  it('falls back to preferredName, then to the local part of their email, when no displayName is set', async () => {
    seedDoc('users/person_2', { preferredName: 'Jo' });
    await request(app).post('/api/ally/invite').set(auth('person_2')).send({ allyEmail: 'friend@example.com' });
    let body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toContain('Jo');

    fetchMock.mockClear();
    // No Firestore doc at all for this uid - falls back to the email local
    // part from the (mocked) decoded auth token, person_3@test.dev.
    await request(app).post('/api/ally/invite').set(auth('person_3')).send({ allyEmail: 'friend@example.com' });
    body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toContain('person_3');
  });

  it('fails loudly instead of silently emailing a broken relative link when APP_URL is not configured', async () => {
    delete process.env.APP_URL;
    const res = await request(app).post('/api/ally/invite').set(auth('person_1')).send({ allyEmail: 'friend@example.com' });

    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still rejects an invalid ally email before ever touching email sending', async () => {
    const res = await request(app).post('/api/ally/invite').set(auth('person_1')).send({ allyEmail: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

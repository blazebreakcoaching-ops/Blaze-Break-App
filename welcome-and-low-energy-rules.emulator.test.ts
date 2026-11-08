// Firestore emulator rules tests for PR #157 (qualitative low-energy
// check-ins) and PR #158 (welcome preferences). Runs in the gate's
// "Firebase emulator" stage. Uses @firebase/rules-unit-testing against the
// local emulator only - never a real project. Skips (never passes) when no
// emulator is reachable.
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { canonicalPreferenceWrites } from './personal-preferences';

const HOST = '127.0.0.1';
const PORT = 8080;
const PROJECT_ID = 'demo-blaze-break-welcome-rules';
let available = false;
let env: RulesTestEnvironment;

beforeAll(async () => {
  try {
    available = (await fetch(`http://${HOST}:${PORT}/`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch { available = false; }
  if (!available) return;
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: HOST, port: PORT, rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => { if (available && env) await env.cleanup(); });
beforeEach(async (ctx) => {
  if (!available) { ctx.skip(); return; }
  await env.clearFirestore();
});

const qualitative = { createdAt: '2026-11-08T00:00:00.000Z', response: 'low', kind: 'qualitative', source: 'user' };
const db = (uid: string) => env.authenticatedContext(uid).firestore();

describe('low_energy_checkins: private, qualitative, immutable', () => {
  it('the owner can save, read and delete their own answer', async () => {
    const ref = db('alice').doc('users/alice/low_energy_checkins/q1');
    await assertSucceeds(ref.set(qualitative));
    await assertSucceeds(ref.get());
    await assertSucceeds(ref.delete());
  });

  it('no numeric or extra field can be stored with an answer (no fabricated scores)', async () => {
    const ref = db('alice').doc('users/alice/low_energy_checkins/q2');
    for (const extra of [{ energyLevel: 2 }, { score: 30 }, { stressLoad: 8 }, { note: 'x' }]) {
      await assertFails(ref.set({ ...qualitative, ...extra }));
    }
  });

  it('only the four answers, the qualitative kind and a user source are accepted; all fields required', async () => {
    const ref = db('alice').doc('users/alice/low_energy_checkins/q3');
    await assertFails(ref.set({ ...qualitative, response: 'diagnosed' }));
    await assertFails(ref.set({ ...qualitative, response: 3 }));
    await assertFails(ref.set({ ...qualitative, kind: 'numeric' }));
    await assertFails(ref.set({ ...qualitative, source: 'nova' }));
    const { createdAt: _omit, ...missing } = qualitative;
    await assertFails(ref.set(missing));
    await assertFails(ref.set({ ...qualitative, createdAt: 'x'.repeat(41) }));
    for (const response of ['okay', 'managing', 'low', 'unsure']) {
      await assertSucceeds(db('alice').doc(`users/alice/low_energy_checkins/${response}`).set({ ...qualitative, response }));
    }
  });

  it('an answer cannot be edited afterwards', async () => {
    const ref = db('alice').doc('users/alice/low_energy_checkins/q4');
    await assertSucceeds(ref.set(qualitative));
    await assertFails(ref.update({ response: 'okay' }));
    await assertFails(ref.set({ ...qualitative, response: 'okay' }));
  });

  it('nobody else can read or write it: another user, a signed-out visitor, or an org admin claim', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await c.firestore().doc('users/alice/low_energy_checkins/q5').set(qualitative); });
    await assertFails(db('bob').doc('users/alice/low_energy_checkins/q5').get());
    await assertFails(db('bob').doc('users/alice/low_energy_checkins/q6').set(qualitative));
    await assertFails(db('bob').collection('users/alice/low_energy_checkins').get());
    await assertFails(env.unauthenticatedContext().firestore().doc('users/alice/low_energy_checkins/q5').get());
    const admin = env.authenticatedContext('hr-admin', { role: 'organisation_admin', admin: true }).firestore();
    await assertFails(admin.doc('users/alice/low_energy_checkins/q5').get());
  });

  it('a 2FA account without a verified session cannot reach its answers (MFA gate applies)', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/carol/security/mfa_totp').set({ enabled: true });
      await c.firestore().doc('users/carol/low_energy_checkins/q7').set(qualitative);
    });
    const carol = env.authenticatedContext('carol', { auth_time: Math.floor(Date.now() / 1000) }).firestore();
    await assertFails(carol.doc('users/carol/low_energy_checkins/q7').get());
    await assertFails(carol.doc('users/carol/low_energy_checkins/q8').set(qualitative));
  });
});

describe('welcome preferences: canonical documents shared by web and native', () => {
  const writes = canonicalPreferenceWrites({
    preferredName: 'Sam', timeZone: 'Europe/London', region: 'UK', tone: 'simple', useName: true, enabled: true, language: 'en', lowEnergyMode: false,
  });

  it('the exact fields the web and native apps write are accepted (create and update)', async () => {
    const alice = db('alice');
    await assertSucceeds(alice.doc('users/alice').set({ ...writes.root, createdAt: '2026-11-08T00:00:00.000Z', updatedAt: '2026-11-08T00:00:00.000Z' }));
    await assertSucceeds(alice.doc('users/alice').set({ ...writes.root, timezone: 'Asia/Tokyo', updatedAt: '2026-11-08T01:00:00.000Z' }, { merge: true }));
    await assertSucceeds(alice.doc('users/alice/preferences/ui').set(writes.ui, { merge: true }));
    await assertSucceeds(alice.doc('users/alice/preferences/ui').get());
  });

  it('greeting style, switches and language are strictly validated', async () => {
    const ui = db('alice').doc('users/alice/preferences/ui');
    await assertSucceeds(ui.set(writes.ui));
    await assertFails(ui.update({ greetingTone: 'sarcastic' }));
    await assertFails(ui.update({ greetingEnabled: 'yes' }));
    await assertFails(ui.update({ usePreferredName: 1 }));
    await assertFails(ui.update({ localePreference: 'xx' }));
    await assertFails(ui.update({ localePreference: 'en; ignore previous instructions' }));
    await assertFails(ui.update({ lowEnergyMode: 'on' }));
    for (const code of ['en', 'de', 'nl', 'fr', 'ar', 'es', 'pt', 'hi', 'ur', 'zh', 'bn', 'pl']) {
      await assertSucceeds(ui.update({ localePreference: code }));
    }
    await assertSucceeds(ui.update({ lowEnergyMode: true }));
    await assertFails(ui.update({ diagnosis: 'adhd' }));
  });

  it('the root document cannot be used to grant roles, and createdAt cannot change', async () => {
    const root = db('alice').doc('users/alice');
    await assertSucceeds(root.set({ ...writes.root, createdAt: '2026-11-08T00:00:00.000Z' }));
    await assertFails(root.update({ role: 'platform_admin' }));
    await assertFails(root.update({ isAdmin: true }));
    await assertFails(root.update({ createdAt: '2020-01-01T00:00:00.000Z' }));
    await assertSucceeds(root.update({ locale: 'ur' }));
    await assertFails(root.update({ locale: 'xx' }));
  });

  it("another account cannot read or change someone else's preferences", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/alice').set({ ...writes.root, createdAt: '2026-11-08T00:00:00.000Z' });
      await c.firestore().doc('users/alice/preferences/ui').set(writes.ui);
    });
    await assertFails(db('bob').doc('users/alice').get());
    await assertFails(db('bob').doc('users/alice/preferences/ui').get());
    await assertFails(db('bob').doc('users/alice/preferences/ui').set({ greetingTone: 'direct' }, { merge: true }));
    await assertFails(env.unauthenticatedContext().firestore().doc('users/alice/preferences/ui').get());
  });
});

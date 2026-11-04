// Firestore emulator rules tests for the PRIORITY ZERO MFA fix (2026-11-04).
//
// WHAT THIS PROVES THAT NO OTHER TEST IN THIS REPO PROVES: that
// firestore.rules itself - not just the REST API's authenticateFirebaseUser
// middleware, not just the React AccountAccessGate component - refuses to
// serve a 2FA-enabled account's private data to a client SDK call that
// presents a valid-but-not-yet-MFA-verified Firebase ID token. The REST and
// UI layers can both be bypassed by talking to Firestore directly; this
// file proves the database itself cannot be.
//
// HOW TO RUN THIS FILE FOR REAL:
//   1. Start the Firestore emulator (this repo already has firebase-tools
//      and a configured firebase.json):
//        npx firebase emulators:start --only firestore --project default
//   2. In a second terminal, with the emulator still running:
//        npm run test:emulator
//   (`npm run test:emulator` is wired to vitest.emulator.config.ts, which is
//   NOT part of the default `npm test` - this file never runs, and never
//   blocks CI, unless someone deliberately starts the emulator and asks for
//   it by name. It IS run as part of the "Firebase emulator" stage of
//   `npm run verify:web:offline` / `verify:integration:offline`, which start
//   the emulator themselves via `firebase emulators:exec`.)
//
// IF THE EMULATOR IS NOT RUNNING: `beforeAll` checks reachability once and
// calls `ctx.skip()` on every test in this file if it cannot reach
// 127.0.0.1:8080 - matching this repo's other emulator test files, so a
// missing emulator is reported as "skipped", never a false "passed" or a
// confusing crash.
//
// NO PRODUCTION CREDENTIALS OR DATABASE: uses @firebase/rules-unit-testing
// (already a dependency of this repo's test-rules.cjs) for every
// client-SDK call under test - that library only ever talks to a local
// emulator, never a real project - plus a separately named Admin SDK app
// (same pattern as nova-calendar-protection-service.emulator.test.ts) to
// seed data exactly the way server.ts's Admin SDK really would, since the
// Admin SDK is what actually writes mfa_session_state in production.

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8080;
const PROJECT_ID = 'demo-blaze-break-mfa-test';
const SECONDS_PER_HOUR = 60 * 60;

let emulatorAvailable = false;
let testEnv: RulesTestEnvironment;
let adminApp: any;
let adminDb: any;
let AdminTimestamp: any;

async function seedMfaSessionState(
  uid: string, verifiedAuthTime: number, expiresInSeconds: number,
): Promise<void> {
  // Written exactly the way server.ts's markFirestoreMfaSessionVerified
  // really does: via the Admin SDK (which always bypasses security rules,
  // in production and in this emulator alike), never via a client context.
  await adminDb.collection('users').doc(uid).collection('security').doc('mfa_session_state').set({
    verifiedAuthTime,
    expiresAt: AdminTimestamp.fromMillis(Date.now() + expiresInSeconds * 1000),
    updatedAt: new Date().toISOString(),
  });
}

beforeAll(async () => {
  try {
    const probe = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/`, { signal: AbortSignal.timeout(2_000) });
    emulatorAvailable = probe.ok;
  } catch {
    emulatorAvailable = false;
  }
  if (!emulatorAvailable) {
    // eslint-disable-next-line no-console
    console.warn(
      `\n[mfa-firestore-session-gate.emulator.test.ts] Firestore emulator not reachable at ${EMULATOR_HOST}:${EMULATOR_PORT} - ` +
      'every test in this file will be SKIPPED, not passed or failed. See this file\'s own header for how to run it for real.\n',
    );
    return;
  }

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATOR_HOST,
      port: EMULATOR_PORT,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });

  process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_HOST}:${EMULATOR_PORT}`;
  const { initializeApp, getApps, deleteApp } = await import('firebase-admin/app');
  const existing = getApps().find((a) => a.name === 'mfa-rules-emulator-test-admin');
  if (existing) await deleteApp(existing);
  adminApp = initializeApp({ projectId: PROJECT_ID }, 'mfa-rules-emulator-test-admin');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  adminDb = getFirestore(adminApp);
  AdminTimestamp = Timestamp;
});

afterAll(async () => {
  if (!emulatorAvailable) return;
  if (testEnv) await testEnv.cleanup();
  if (adminApp) {
    const { deleteApp } = await import('firebase-admin/app');
    await deleteApp(adminApp);
  }
});

beforeEach(async (ctx) => {
  if (!emulatorAvailable) {
    ctx.skip();
    return;
  }
  await testEnv.clearFirestore();
});

describe('Firestore rules enforce MFA session verification directly (not just REST/UI)', () => {
  it('an account with no 2FA enabled is unaffected - the pre-existing, overwhelmingly common case', async () => {
    const alice = testEnv.authenticatedContext('alice');
    // No mfaEnabled claim at all, and no mfa_session_state doc - exactly
    // today's shape for every account that has never turned on 2FA.
    await assertSucceeds(alice.firestore().collection('users').doc('alice').set({
      displayName: 'Alice', createdAt: '2026-01-01T00:00:00.000Z',
    }));
    await assertSucceeds(alice.firestore().collection('users').doc('alice').get());
    await assertSucceeds(alice.firestore().collection('users').doc('alice')
      .collection('checkins').doc('c1').set({
        createdAt: '2026-01-01', updatedAt: '2026-01-01', energyLevel: 5, focusLevel: 5,
        detachmentLevel: 5, stressLoad: 5, source: 'user',
      }));
  });

  it('THE VULNERABILITY: a 2FA-enabled account with NO verified session cannot read or write its own data', async () => {
    const authTime = Math.floor(Date.now() / 1000);
    // mfaEnabled=true (this account has 2FA on) but no mfa_session_state
    // doc exists at all - the exact shape of a password-valid ID token for
    // an account that has never cleared the TOTP challenge this session.
    const bob = testEnv.authenticatedContext('bob', { mfaEnabled: true, auth_time: authTime });
    await assertFails(bob.firestore().collection('users').doc('bob').get());
    await assertFails(bob.firestore().collection('users').doc('bob').set({
      displayName: 'Bob', createdAt: '2026-01-01T00:00:00.000Z',
    }));
    await assertFails(bob.firestore().collection('users').doc('bob')
      .collection('checkins').doc('c1').set({
        createdAt: '2026-01-01', updatedAt: '2026-01-01', energyLevel: 5, focusLevel: 5,
        detachmentLevel: 5, stressLoad: 5, source: 'user',
      }));
  });

  it('a verified session (correct auth_time, unexpired) is let through', async () => {
    const authTime = Math.floor(Date.now() / 1000);
    await seedMfaSessionState('carol', authTime, 12 * SECONDS_PER_HOUR);
    const carol = testEnv.authenticatedContext('carol', { mfaEnabled: true, auth_time: authTime });
    await assertSucceeds(carol.firestore().collection('users').doc('carol').set({
      displayName: 'Carol', createdAt: '2026-01-01T00:00:00.000Z',
    }));
    await assertSucceeds(carol.firestore().collection('users').doc('carol').get());
  });

  it('session expiry: a verified-but-expired session is denied again, not grandfathered in', async () => {
    const authTime = Math.floor(Date.now() / 1000);
    // expiresAt in the past - e.g. the 12-hour window from a real
    // verify-at-signin has simply elapsed.
    await seedMfaSessionState('dana', authTime, -1);
    const dana = testEnv.authenticatedContext('dana', { mfaEnabled: true, auth_time: authTime });
    await assertFails(dana.firestore().collection('users').doc('dana').get());
    await assertFails(dana.firestore().collection('users').doc('dana').set({ displayName: 'Dana' }));
  });

  it('wrong session: a DIFFERENT sign-in (new auth_time) that never itself verified is denied, even with an old verified record on file', async () => {
    const originalAuthTime = Math.floor(Date.now() / 1000) - 3600;
    await seedMfaSessionState('erin', originalAuthTime, 12 * SECONDS_PER_HOUR);
    // A fresh sign-in (e.g. a new device, or signing back in after signing
    // out) gets a NEW auth_time. This proves verification is bound to the
    // specific session that earned it, not the account as a whole - the
    // exact "account-wide custom claim" trap the fix must avoid.
    const newAuthTime = Math.floor(Date.now() / 1000);
    const erinNewSession = testEnv.authenticatedContext('erin', { mfaEnabled: true, auth_time: newAuthTime });
    await assertFails(erinNewSession.firestore().collection('users').doc('erin').get());
    await assertFails(erinNewSession.firestore().collection('users').doc('erin').set({ displayName: 'Erin' }));
  });

  it('cross-account access stays denied regardless of either account\'s MFA/session state', async () => {
    const authTime = Math.floor(Date.now() / 1000);
    await seedMfaSessionState('frank', authTime, 12 * SECONDS_PER_HOUR);
    await seedMfaSessionState('grace', authTime, 12 * SECONDS_PER_HOUR);
    const frank = testEnv.authenticatedContext('frank', { mfaEnabled: true, auth_time: authTime });
    // Frank has a fully verified session of his own, but that never
    // authorises reading or writing Grace's data.
    await assertFails(frank.firestore().collection('users').doc('grace').get());
    await assertFails(frank.firestore().collection('users').doc('grace')
      .collection('checkins').doc('c1').set({
        createdAt: '2026-01-01', updatedAt: '2026-01-01', energyLevel: 5, focusLevel: 5,
        detachmentLevel: 5, stressLoad: 5, source: 'user',
      }));
  });

  it('recovery: disabling 2FA (no mfaEnabled claim) restores access without needing any session record', async () => {
    // Mirrors /api/auth/mfa/totp/disable, which clears the Firestore
    // session record AND the custom claim - but access must be restored by
    // the claim going away even if a stale record were somehow still
    // present, since mfaEnabled!=true already short-circuits the gate.
    const henry = testEnv.authenticatedContext('henry');
    await assertSucceeds(henry.firestore().collection('users').doc('henry').get());
    await assertSucceeds(henry.firestore().collection('users').doc('henry').set({
      displayName: 'Henry', createdAt: '2026-01-01T00:00:00.000Z',
    }));
  });

  it('a read-only userId-keyed collection outside users/{uid} (audit_logs) gets the same gate', async () => {
    await adminDb.collection('audit_logs').doc('log1').set({
      userId: 'iris', action: 'consent_updated', createdAt: '2026-01-01T00:00:00.000Z',
    });
    const authTime = Math.floor(Date.now() / 1000);
    const irisUnverified = testEnv.authenticatedContext('iris', { mfaEnabled: true, auth_time: authTime });
    await assertFails(irisUnverified.firestore().collection('audit_logs').doc('log1').get());

    await seedMfaSessionState('iris', authTime, 12 * SECONDS_PER_HOUR);
    const irisVerified = testEnv.authenticatedContext('iris', { mfaEnabled: true, auth_time: authTime });
    await assertSucceeds(irisVerified.firestore().collection('audit_logs').doc('log1').get());
  });
});

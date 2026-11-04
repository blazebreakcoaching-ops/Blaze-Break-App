// Firestore emulator rules tests for the PRIORITY ZERO MFA fix (2026-11-04)
// and its INDEPENDENT REVIEW FOLLOW-UP (2026-11-04, same date - a second
// round of fixes landed the same day after an external review of the first).
//
// WHAT THIS PROVES THAT NO OTHER TEST IN THIS REPO PROVES: that
// firestore.rules itself - not just the REST API's authenticateFirebaseUser
// middleware, not just the React AccountAccessGate component - refuses to
// serve a 2FA-enabled account's private data to a client SDK call that
// presents a valid-but-not-yet-MFA-verified Firebase ID token. The REST and
// UI layers can both be bypassed by talking to Firestore directly; this
// file proves the database itself cannot be - AND that "is 2FA mandatory"
// is decided from the authoritative enrollment record, never a token claim
// that can be stale or absent, AND that concurrent, legitimate multi-device
// sessions are never falsely revoked by each other.
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
// Admin SDK is what actually writes mfa_totp/mfa_session_state in
// production.

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

// Mirrors server.ts's setMfaEnabledClaim target doc - the ONE authoritative
// record isMfaEnrolledAuthoritative() (firestore.rules) and
// isMfaEnrollmentActive() (server.ts) both read directly. Never the token
// claim - that's the exact staleness gap the independent review caught.
async function seedEnrollment(uid: string, enabled: boolean): Promise<void> {
  await adminDb.collection('users').doc(uid).collection('security').doc('mfa_totp').set({ enabled });
}

// Mirrors server.ts's markFirestoreMfaSessionVerified - merges ONE verified
// session into the verifiedSessions map without disturbing any other
// still-valid entry, exactly like a second device's own independent
// verification must not revoke a first device's.
async function seedVerifiedSession(uid: string, authTime: number, expiresInSeconds: number): Promise<void> {
  const docRef = adminDb.collection('users').doc(uid).collection('security').doc('mfa_session_state');
  const snap = await docRef.get();
  const existing = (snap.exists ? snap.data()?.verifiedSessions : null) || {};
  await docRef.set({
    verifiedSessions: {
      ...existing,
      [String(authTime)]: AdminTimestamp.fromMillis(Date.now() + expiresInSeconds * 1000),
    },
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
    // No enrollment doc at all, and no mfa_session_state doc - exactly
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
    await seedEnrollment('bob', true);
    // No mfa_session_state doc exists at all - the exact shape of a
    // password-valid ID token for an account that has never cleared the
    // TOTP challenge this session.
    const bob = testEnv.authenticatedContext('bob', { auth_time: authTime });
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
    await seedEnrollment('carol', true);
    await seedVerifiedSession('carol', authTime, 12 * SECONDS_PER_HOUR);
    const carol = testEnv.authenticatedContext('carol', { auth_time: authTime });
    await assertSucceeds(carol.firestore().collection('users').doc('carol').set({
      displayName: 'Carol', createdAt: '2026-01-01T00:00:00.000Z',
    }));
    await assertSucceeds(carol.firestore().collection('users').doc('carol').get());
  });

  it('session expiry: a verified-but-expired session is denied again, not grandfathered in', async () => {
    const authTime = Math.floor(Date.now() / 1000);
    await seedEnrollment('dana', true);
    // expiresAt in the past - e.g. the 12-hour window from a real
    // verify-at-signin has simply elapsed.
    await seedVerifiedSession('dana', authTime, -1);
    const dana = testEnv.authenticatedContext('dana', { auth_time: authTime });
    await assertFails(dana.firestore().collection('users').doc('dana').get());
    await assertFails(dana.firestore().collection('users').doc('dana').set({ displayName: 'Dana' }));
  });

  it('wrong session: a DIFFERENT sign-in (new auth_time) that never itself verified is denied, even with an old verified record on file', async () => {
    const originalAuthTime = Math.floor(Date.now() / 1000) - 3600;
    await seedEnrollment('erin', true);
    await seedVerifiedSession('erin', originalAuthTime, 12 * SECONDS_PER_HOUR);
    // A fresh sign-in (e.g. a new device, or signing back in after signing
    // out) gets a NEW auth_time. This proves verification is bound to the
    // specific session that earned it, not the account as a whole - the
    // exact "account-wide custom claim" trap the fix must avoid.
    const newAuthTime = Math.floor(Date.now() / 1000);
    const erinNewSession = testEnv.authenticatedContext('erin', { auth_time: newAuthTime });
    await assertFails(erinNewSession.firestore().collection('users').doc('erin').get());
    await assertFails(erinNewSession.firestore().collection('users').doc('erin').set({ displayName: 'Erin' }));
  });

  it('cross-account access stays denied regardless of either account\'s MFA/session state', async () => {
    const authTime = Math.floor(Date.now() / 1000);
    await seedEnrollment('frank', true);
    await seedEnrollment('grace', true);
    await seedVerifiedSession('frank', authTime, 12 * SECONDS_PER_HOUR);
    await seedVerifiedSession('grace', authTime, 12 * SECONDS_PER_HOUR);
    const frank = testEnv.authenticatedContext('frank', { auth_time: authTime });
    // Frank has a fully verified session of his own, but that never
    // authorises reading or writing Grace's data.
    await assertFails(frank.firestore().collection('users').doc('grace').get());
    await assertFails(frank.firestore().collection('users').doc('grace')
      .collection('checkins').doc('c1').set({
        createdAt: '2026-01-01', updatedAt: '2026-01-01', energyLevel: 5, focusLevel: 5,
        detachmentLevel: 5, stressLoad: 5, source: 'user',
      }));
  });

  it('recovery: disabling 2FA restores access without needing any session record', async () => {
    // Mirrors /api/auth/mfa/totp/disable, which sets mfa_totp.enabled:false
    // (the authoritative fact) and clears mfa_session_state - access is
    // restored by the authoritative enrollment flag going false, which
    // alone short-circuits the gate regardless of any session record.
    await seedEnrollment('henry', false);
    const henry = testEnv.authenticatedContext('henry', { auth_time: Math.floor(Date.now() / 1000) });
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
    await seedEnrollment('iris', true);
    const irisUnverified = testEnv.authenticatedContext('iris', { auth_time: authTime });
    await assertFails(irisUnverified.firestore().collection('audit_logs').doc('log1').get());

    await seedVerifiedSession('iris', authTime, 12 * SECONDS_PER_HOUR);
    const irisVerified = testEnv.authenticatedContext('iris', { auth_time: authTime });
    await assertSucceeds(irisVerified.firestore().collection('audit_logs').doc('log1').get());
  });
});

// INDEPENDENT REVIEW FOLLOW-UP (2026-11-04), issue 1: "is MFA mandatory"
// must come from the authoritative enrollment record, never the mfaEnabled
// token claim - which can be stale (a token minted before enrollment) or
// simply never synced (a failed setCustomUserClaims write).
describe('Authoritative enrollment state - the gate never trusts the mfaEnabled token claim', () => {
  it('still gates access when the token has NO mfaEnabled claim at all, but the account IS enrolled per Firestore', async () => {
    const authTime = Math.floor(Date.now() / 1000);
    await seedEnrollment('claimless', true);
    // No mfaEnabled claim passed at all - simulating a cached ID token
    // issued moments before enrollment completed.
    const claimless = testEnv.authenticatedContext('claimless', { auth_time: authTime });
    await assertFails(claimless.firestore().collection('users').doc('claimless').get());
  });

  it('still gates access when the token carries a STALE mfaEnabled:false claim, but the account IS enrolled per Firestore', async () => {
    const authTime = Math.floor(Date.now() / 1000);
    await seedEnrollment('staleclaim', true);
    const staleclaim = testEnv.authenticatedContext('staleclaim', { mfaEnabled: false, auth_time: authTime });
    await assertFails(staleclaim.firestore().collection('users').doc('staleclaim').get());
  });

  it('a TRUE mfaEnabled claim on an account that is NOT actually enrolled per Firestore does not itself grant anything extra, nor block the account', async () => {
    // The inverse mismatch - claim says enabled, Firestore record says not.
    // Since the claim is never consulted at all any more, this account is
    // correctly treated as not requiring a session (matching the
    // authoritative record), not blocked by the claim's stale "true".
    const authTime = Math.floor(Date.now() / 1000);
    await seedEnrollment('falseclaim', false);
    const falseclaim = testEnv.authenticatedContext('falseclaim', { mfaEnabled: true, auth_time: authTime });
    await assertSucceeds(falseclaim.firestore().collection('users').doc('falseclaim').get());
  });
});

// INDEPENDENT REVIEW FOLLOW-UP (2026-11-04), issue 2: session binding.
// mfa_session_state used to store a single {verifiedAuthTime, expiresAt}
// pair - a second device's own legitimate verification would silently
// overwrite (and thereby revoke) a first device's still-valid session. It
// now stores a map of every distinct, independently-verified auth_time.
describe('Concurrent multi-device sessions and session-specific revocation', () => {
  it('two genuinely different, independently-verified sessions on the same account both stay valid at once', async () => {
    await seedEnrollment('multidevice', true);
    const device1AuthTime = Math.floor(Date.now() / 1000);
    const device2AuthTime = device1AuthTime + 3600; // a later, separate sign-in
    await seedVerifiedSession('multidevice', device1AuthTime, 12 * SECONDS_PER_HOUR);
    // Device 2 verifies independently, SECOND - this must not revoke
    // device 1's still-valid entry (the exact bug this fix closes).
    await seedVerifiedSession('multidevice', device2AuthTime, 12 * SECONDS_PER_HOUR);

    const device1 = testEnv.authenticatedContext('multidevice', { auth_time: device1AuthTime });
    const device2 = testEnv.authenticatedContext('multidevice', { auth_time: device2AuthTime });
    await assertSucceeds(device1.firestore().collection('users').doc('multidevice').get());
    await assertSucceeds(device2.firestore().collection('users').doc('multidevice').get());
  });

  it('MFA proof reuse across sessions: a session that never itself verified cannot ride on a DIFFERENT session\'s valid entry', async () => {
    await seedEnrollment('reuse', true);
    const verifiedAuthTime = Math.floor(Date.now() / 1000);
    await seedVerifiedSession('reuse', verifiedAuthTime, 12 * SECONDS_PER_HOUR);
    const neverVerifiedAuthTime = verifiedAuthTime + 9999;
    const unverifiedSession = testEnv.authenticatedContext('reuse', { auth_time: neverVerifiedAuthTime });
    await assertFails(unverifiedSession.firestore().collection('users').doc('reuse').get());
  });

  it('an expired entry for one device does not affect a different, still-valid entry for another', async () => {
    await seedEnrollment('mixedexpiry', true);
    const expiredAuthTime = Math.floor(Date.now() / 1000) - 100000;
    const validAuthTime = Math.floor(Date.now() / 1000);
    await seedVerifiedSession('mixedexpiry', expiredAuthTime, -1); // already expired
    await seedVerifiedSession('mixedexpiry', validAuthTime, 12 * SECONDS_PER_HOUR);

    const expiredDevice = testEnv.authenticatedContext('mixedexpiry', { auth_time: expiredAuthTime });
    const validDevice = testEnv.authenticatedContext('mixedexpiry', { auth_time: validAuthTime });
    await assertFails(expiredDevice.firestore().collection('users').doc('mixedexpiry').get());
    await assertSucceeds(validDevice.firestore().collection('users').doc('mixedexpiry').get());
  });

  // KNOWN, DELIBERATELY DISCLOSED RESIDUAL LIMITATION (see firestore.rules'
  // own mfaSessionSatisfied() comment): auth_time has one-second
  // resolution, so two genuinely different sign-ins landing in the exact
  // same wall-clock second are indistinguishable to this check. This test
  // demonstrates that boundary honestly rather than leaving it
  // unexamined - it is not something this round of fixes can close without
  // new infrastructure (a Firebase Identity Platform beforeSignIn blocking
  // function minting a real per-sign-in claim), which is out of scope to
  // deploy unilaterally here.
  it('DISCLOSED LIMITATION: two independent sign-ins sharing the exact same auth_time are indistinguishable to this check', async () => {
    await seedEnrollment('collision', true);
    const sharedAuthTime = Math.floor(Date.now() / 1000);
    // Only ONE of these two "sign-ins" ever actually verified - the second
    // is a coincidental, same-second collision, not a verification.
    await seedVerifiedSession('collision', sharedAuthTime, 12 * SECONDS_PER_HOUR);
    const secondNeverVerifiedSession = testEnv.authenticatedContext('collision', { auth_time: sharedAuthTime });
    // This is the one honestly-disclosed case where the gate cannot tell
    // the two sessions apart - it succeeds, demonstrating the boundary
    // rather than hiding it.
    await assertSucceeds(secondNeverVerifiedSession.firestore().collection('users').doc('collision').get());
  });
});

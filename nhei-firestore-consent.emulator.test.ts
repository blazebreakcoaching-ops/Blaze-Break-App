// Run against a local Firestore emulator: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test -- nhei-firestore-consent.emulator.test.ts
// These are actual security-rule checks, unlike source-string contract tests.
// Do not run against production data.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const suite = host ? describe : describe.skip;
let env: RulesTestEnvironment;

const permissions = (enabled: boolean) => ({
  allowCheckins: true, allowEnergyBudgets: true, allowMoodPulses: true,
  allowBodyCheckins: true, allowWins: true, allowWeeklyReviews: true,
  allowBoundaryScripts: true, allowGoals: true, allowRecoveryDebt: true,
  allowRecoveryVelocity: true, allowEnergyTrend: true, allowMoodTrend: true,
  allowNovaMemory: enabled, allowNovaUseSavedMemories: enabled,
  updatedAt: '2026-11-08T00:00:00Z',
});
const memory = () => ({
  type: 'preference', content: 'Please ask one question at a time',
  source: 'User Feedback', confidence: 'high', canEdit: true,
  createdAt: '2026-11-08T00:00:00Z',
  updatedAt: '2026-11-08T00:00:00Z',
  canonicalKey: null, dataZone: 'private_recovery_vault',
});

suite('NHEI Firestore memory consent security', () => {
  beforeAll(async () => {
    const [hostname = '127.0.0.1', port = '8080'] = host!.split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-nhei-rules',
      firestore: {
        host: hostname, port: Number(port || 8080),
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    });
  });
  afterAll(async () => { await env?.cleanup(); });
  beforeEach(async () => { await env.clearFirestore(); });

  it('denies new memory creation without consent', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users/alice/nova_memories/a'), memory()));
  });

  it('allows creation only after authenticated owner grants memory consent', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/alice/nova_permissions/current'), permissions(true)));
    await assertSucceeds(setDoc(doc(db, 'users/alice/nova_memories/a'), memory()));
  });

  it('blocks new memory after withdrawal, but allows correction and erasure of the original', async () => {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'users/alice/nova_permissions/current'), permissions(false));
      await setDoc(doc(db, 'users/alice/nova_memories/a'), memory());
    });
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users/alice/nova_memories/b'), memory()));
    await assertSucceeds(updateDoc(doc(db, 'users/alice/nova_memories/a'), {
      content: 'Ask before suggesting', updatedAt: '2026-11-08T00:01:00Z',
    }));
    await assertFails(updateDoc(doc(db, 'users/alice/nova_memories/a'), { canEdit: false }));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/nova_memories/a')));
  });

  it('blocks another account from viewing or editing private memories', async () => {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'users/alice/nova_memories/a'), memory());
    });
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(db, 'users/alice/nova_memories/a')));
    await assertFails(deleteDoc(doc(db, 'users/alice/nova_memories/a')));
  });
});

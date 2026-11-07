// PHASE 6A, directive §10 - regression coverage for the Phase 5N
// account-isolation protections, specifically where THIS new evaluation
// framework interacts with memory/conversations. Phase 5N's own fix
// (src/lib/nova-chat-storage.ts) scoped the CLIENT-side chat-transcript
// cache by UID; this file checks the equivalent property one layer
// down, at the server/Firestore boundary this framework's own tool-call
// scenarios (S08-S11, S25) actually exercise - that `remember_about_user`
// and `search_nova_memories`, reached through the real
// `/api/nova/chat` route exactly as the offline scenario suite reaches
// them, never let one synthetic account read or be influenced by
// another's saved memories. Two distinct synthetic uids are driven
// through the SAME fake Firestore instance in the SAME test (no
// `resetStore()` between them) specifically so a real leak would have
// somewhere to happen.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    lastConfig: null as any,
    sendMessage: vi.fn(async () => ({ text: 'ok', functionCalls: [] })),
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = { create: (config: any) => { h.lastConfig = config; return { sendMessage: h.sendMessage }; } };
    models = { generateContent: vi.fn() };
    live = { connect: vi.fn() };
  },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc } from './test/fake-firestore';
import { runScenario, type NovaChatInvoker } from './nova-chat-scenario-runner';
import { NOVA_CHAT_SCENARIOS } from './nova-chat-scenario-library';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const MEMORY_CONSENT_GRANTED = { allowNovaMemory: true, allowNovaUseSavedMemories: true };

const invoker: NovaChatInvoker = async ({ uid, message, history }) => {
  const res = await request(app).post('/api/nova/chat').set(auth(uid)).send({ message, history });
  return { status: res.status, body: res.body, systemInstructionSentToModel: h.lastConfig?.config?.systemInstruction ?? null };
};

beforeEach(() => {
  resetStore();
  h.lastConfig = null;
  h.sendMessage.mockReset();
});

describe('Nova chat evaluation framework - cross-account memory isolation regression (Phase 5N follow-on)', () => {
  it('Account B can never read Account A\'s saved memories through search_nova_memories, even run back-to-back against the same Firestore instance', async () => {
    const ACCOUNT_A = 'eval_cross_account_A';
    const ACCOUNT_B = 'eval_cross_account_B';

    await seedDoc(`users/${ACCOUNT_A}/nova_permissions/current`, MEMORY_CONSENT_GRANTED);
    await seedDoc(`users/${ACCOUNT_A}/nova_memories/mem_a`, { type: 'preference', content: "Account A's private saved note - must never reach Account B.", confidence: 'high', canEdit: true });

    await seedDoc(`users/${ACCOUNT_B}/nova_permissions/current`, MEMORY_CONSENT_GRANTED);
    // Account B has no seeded memories of its own - any result at all would be a leak from A.

    h.sendMessage.mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'search_nova_memories', args: { query: 'private' } }] }));
    h.sendMessage.mockImplementationOnce(async () => ({ text: "I don't have anything saved matching that.", functionCalls: [] }));
    const resB = await request(app).post('/api/nova/chat').set(auth(ACCOUNT_B)).send({ message: 'What do you know about any private notes?' });

    expect(resB.status).toBe(200);
    const searchCall = (resB.body.planTrace ?? []).find((p: any) => p.tool === 'search_nova_memories');
    expect(searchCall, 'Account B\'s turn should have called search_nova_memories').toBeTruthy();
    expect(searchCall.result.results).toEqual([]);
    expect(JSON.stringify(resB.body)).not.toContain("Account A's private saved note");
  });

  it('Account A\'s remember_about_user write lands only under Account A\'s own Firestore path, never visible to Account B\'s own search', async () => {
    const ACCOUNT_A = 'eval_cross_account_write_A';
    const ACCOUNT_B = 'eval_cross_account_write_B';
    await seedDoc(`users/${ACCOUNT_A}/nova_permissions/current`, MEMORY_CONSENT_GRANTED);
    await seedDoc(`users/${ACCOUNT_B}/nova_permissions/current`, MEMORY_CONSENT_GRANTED);

    h.sendMessage.mockImplementationOnce(async () => ({
      text: 'Noted.',
      functionCalls: [{ name: 'remember_about_user', args: { type: 'preference', content: 'Account A only ever discusses this with Nova directly.', confidence: 'high' } }],
    }));
    const resA = await request(app).post('/api/nova/chat').set(auth(ACCOUNT_A)).send({ message: 'Please remember this about me.' });
    expect(resA.status).toBe(200);
    expect(resA.body.planTrace?.[0]?.result?.saved).toBe(true);

    h.sendMessage.mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'search_nova_memories', args: { query: 'Account A' } }] }));
    h.sendMessage.mockImplementationOnce(async () => ({ text: 'Nothing on file.', functionCalls: [] }));
    const resB = await request(app).post('/api/nova/chat').set(auth(ACCOUNT_B)).send({ message: 'Do you have anything saved about "Account A"?' });
    expect(resB.status).toBe(200);
    const searchCallB = (resB.body.planTrace ?? []).find((p: any) => p.tool === 'search_nova_memories');
    expect(searchCallB.result.results).toEqual([]);
  });

  it('every scenario in the library that writes or reads memory does so under its own synthetic uid only (framework-level sanity, not just a single pair)', async () => {
    const memoryScenarios = NOVA_CHAT_SCENARIOS.filter((s) => s.permissionsDoc || s.seededMemories);
    expect(memoryScenarios.length).toBeGreaterThan(0);

    for (const scenario of memoryScenarios) {
      const uidA = `eval_fw_${scenario.id}_A`;
      const uidB = `eval_fw_${scenario.id}_B`; // a second, never-seeded account run in the SAME store right after A
      if (scenario.permissionsDoc) {
        await seedDoc(`users/${uidA}/nova_permissions/current`, scenario.permissionsDoc);
        await seedDoc(`users/${uidB}/nova_permissions/current`, scenario.permissionsDoc);
      }
      if (scenario.seededMemories) {
        for (const mem of scenario.seededMemories) await seedDoc(`users/${uidA}/nova_memories/${mem.id}`, mem);
      }

      for (const turn of scenario.turns) {
        h.sendMessage.mockImplementationOnce(async () => ({ text: turn.offlineModelResponse.text, functionCalls: turn.offlineModelResponse.functionCalls ?? [] }));
        if (turn.offlineModelResponse.functionCalls && turn.offlineModelResponse.functionCalls.length > 0) {
          h.sendMessage.mockImplementationOnce(async () => ({ text: turn.offlineModelFollowUp?.text ?? turn.offlineModelResponse.text, functionCalls: turn.offlineModelFollowUp?.functionCalls ?? [] }));
        }
      }
      await runScenario(scenario, invoker, uidA);

      // Account B, never seeded, asks the same thing A was seeded with -
      // any non-empty search result or reused content would be a leak
      // across synthetic identities within this framework's own run.
      if (scenario.seededMemories && scenario.seededMemories.length > 0) {
        h.sendMessage.mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'search_nova_memories', args: { query: 'preference state profile' } }] }));
        h.sendMessage.mockImplementationOnce(async () => ({ text: 'Nothing found.', functionCalls: [] }));
        const resB = await request(app).post('/api/nova/chat').set(auth(uidB)).send({ message: 'What do you know about me?' });
        expect(resB.status).toBe(200);
        const searchCallB = (resB.body.planTrace ?? []).find((p: any) => p.tool === 'search_nova_memories');
        if (searchCallB) expect(searchCallB.result.results).toEqual([]);
      }
    }
  });
});

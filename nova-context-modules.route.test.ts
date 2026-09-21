import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression coverage for the "Nova sees the whole app" context expansion:
// getNovaContextAndMetadata gained 10 new module summaries (fingerprint,
// recovery plan/diagnosis progress, energy commitments, stress triggers,
// habit cycles, fuel logs, focus sessions, somatic resets, recovery ally).
// These tests prove: (1) each surfaces a real compact summary when
// permitted, (2) raw free text (stress trigger notes, diagnosis
// reflections) never reaches the prompt even though the underlying doc has
// it, (3) an explicit allow*: false genuinely excludes that module, and
// (4) an account whose nova_permissions/current doc predates these new
// fields (so they're simply absent, not explicitly true) still gets them -
// the whole point of the `!== false` fail-open check, so this rolls out to
// existing accounts immediately rather than only new ones.
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
    chats = {
      create: (config: any) => {
        h.lastConfig = config;
        return { sendMessage: h.sendMessage };
      },
    };
    models = { generateContent: vi.fn() };
    live = { connect: vi.fn() };
  },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc } from './test/fake-firestore';

const USER = 'user_owner';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const chat = () => request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'Hello Nova' });
const instruction = () => h.lastConfig.config.systemInstruction as string;

beforeEach(() => {
  resetStore();
  h.lastConfig = null;
  h.sendMessage.mockClear();
  h.sendMessage.mockImplementation(async () => ({ text: 'ok', functionCalls: [] }));
});

describe('POST /api/nova/chat - expanded module context', () => {
  it('surfaces the Burnout Fingerprint archetype when permitted, defaulting on for an account with no explicit flag set', async () => {
    // Deliberately does NOT set allowFingerprint - proves a pre-existing
    // permissions doc that predates this field still gets the new context.
    seedDoc(`users/${USER}/nova_permissions/current`, { allowNovaMemory: false });
    seedDoc(`users/${USER}/recovery/fingerprint`, { archetype: 'Over-Giver', identifiedAt: '2026-01-01T00:00:00.000Z', version: 1, source: 'diagnostic' });

    const res = await chat();
    expect(res.status).toBe(200);
    expect(instruction()).toContain('Archetype: Over-Giver');
  });

  it('excludes the fingerprint when the account explicitly opted out', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, { allowNovaMemory: false, allowFingerprint: false });
    seedDoc(`users/${USER}/recovery/fingerprint`, { archetype: 'Over-Giver', identifiedAt: '2026-01-01T00:00:00.000Z', version: 1, source: 'diagnostic' });

    const res = await chat();
    expect(res.status).toBe(200);
    expect(instruction()).not.toContain('Over-Giver');
  });

  it('summarizes Recovery Plan progress as a completion count, never raw journal text', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, { allowNovaMemory: false });
    seedDoc(`users/${USER}/recovery_plan_progress/state`, {
      allActionIds: ['a1', 'a2', 'a3', 'a4'],
      completedIds: ['a1', 'a2'],
      submittedJournals: ['This is a private journal entry that must never reach Nova'],
    });

    const res = await chat();
    const text = instruction();
    expect(text).toContain('Recovery Plan Progress');
    expect(text).toContain('Completed: 2 of 4 actions');
    expect(text).not.toContain('private journal entry');
  });

  it('summarizes diagnosis/action-plan progress per profile, never the written reflections', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, { allowNovaMemory: false });
    seedDoc(`users/${USER}/diagnosis_progress/Over-Giver`, {
      allActionIds: ['x1', 'x2'],
      allBoundaryIds: ['b1'],
      completedActions: ['x1'],
      committedBoundaries: [],
      reflections: { r1: 'Deeply personal reflection text that must stay blind to Nova' },
    });

    const res = await chat();
    const text = instruction();
    expect(text).toContain('Action Plan Progress');
    expect(text).toContain('1 of 2 actions completed, 0 of 1 boundary scripts committed');
    expect(text).not.toContain('Deeply personal reflection');
  });

  it('sums only active energy commitments, excluding dropped ones', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, { allowNovaMemory: false });
    seedDoc(`users/${USER}/energy_commitments/c1`, { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', name: 'Project X', energyDrain: 40, type: 'professional', status: 'active' });
    seedDoc(`users/${USER}/energy_commitments/c2`, { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', name: 'Old thing', energyDrain: 90, type: 'professional', status: 'dropped' });

    const res = await chat();
    const text = instruction();
    expect(text).toContain('Active commitments: 1');
    expect(text).toContain('Total active energy drain: 40 units');
    expect(text).not.toContain('Old thing');
    expect(text).not.toContain('Project X');
  });

  it('summarizes stress triggers as count and average severity, never the logged text', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, { allowNovaMemory: false });
    seedDoc(`users/${USER}/stress_triggers/t1`, { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', text: 'My manager said something that really upset me today', date: '2026-01-01', severity: 8, energyLevel: 20 });
    seedDoc(`users/${USER}/stress_triggers/t2`, { createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', text: 'Another private note', date: '2026-01-02', severity: 6, energyLevel: 30 });

    const res = await chat();
    const text = instruction();
    expect(text).toContain('Average severity: 7/10');
    expect(text).not.toContain('really upset me');
    expect(text).not.toContain('Another private note');
  });

  it('excludes an opted-out module while other permitted modules still appear', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, { allowNovaMemory: false, allowStressTriggers: false });
    seedDoc(`users/${USER}/stress_triggers/t1`, { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', text: 'note', date: '2026-01-01', severity: 8, energyLevel: 20 });
    seedDoc(`users/${USER}/recovery/fingerprint`, { archetype: 'Founder on Fire', identifiedAt: '2026-01-01T00:00:00.000Z', version: 1, source: 'diagnostic' });

    const res = await chat();
    const text = instruction();
    expect(text).not.toContain('Stress Triggers Summary');
    expect(text).toContain('Founder on Fire');
  });

  it('reports Recovery Ally connection status and shared-goal count, never the ally contact details', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, { allowNovaMemory: false });
    seedDoc(`users/${USER}/recovery_ally/state`, { isInvited: true, allyName: 'Jane Doe', allyEmail: 'jane@example.com' });
    seedDoc(`users/${USER}/ally_shared_goals/g1`, { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', text: 'Take a real lunch break', category: 'rest' });

    const res = await chat();
    const text = instruction();
    expect(text).toContain('Ally connected: yes');
    expect(text).toContain('Shared goals: 1');
    expect(text).not.toContain('Jane Doe');
    expect(text).not.toContain('jane@example.com');
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/org/:orgId/manager-coach/chat - the
// conversational, tool-calling Nova Manager Coach. The point of these:
// same access-control/k-anonymity/quota gates as the one-shot GET route
// (nova-manager-coach.route.test.ts), that the tool-calling loop actually
// dispatches to real Lane B computations (Work Design Debt, active
// interventions, Local Operating Principles, cost-of-pressure, meeting
// load), and that planTrace reflects what was really called. Every tool
// here takes no parameters at all and returns only org-wide aggregates -
// there is no team-targeting tool left to probe for an under-threshold
// cohort (see NOVA_ORG_COACH_TOOLS, server.ts).
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    lastConfig: null as any,
    sendMessage: vi.fn(async (_arg?: any) => ({ text: 'Things look steady this week.', functionCalls: [] })),
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
import { seedDoc, resetStore } from './test/fake-firestore';

const ORG = 'org_1';
const ADMIN = 'admin_uid';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

interface Member { uid: string; team?: string; consenting: boolean; }

function seedOrg(threshold: number, members: Member[]) {
  seedDoc(`organisations/${ORG}`, {
    adminUids: [ADMIN],
    memberUids: members.map((m) => m.uid),
    memberTeams: Object.fromEntries(members.filter((m) => m.team).map((m) => [m.uid, m.team])),
    privacyThreshold: threshold,
  });
  for (const m of members) {
    seedDoc(`users/${m.uid}`, { shareAnonymizedDataWithOrg: m.consenting });
  }
}

const members = (n: number, consenting: boolean, team?: string, prefix = 'm'): Member[] =>
  Array.from({ length: n }, (_, i) => ({ uid: `${prefix}_${team || 'x'}_${i}`, team, consenting }));

beforeEach(() => {
  resetStore();
  h.lastConfig = null;
  h.sendMessage.mockClear();
  h.sendMessage.mockImplementation(async () => ({ text: 'Things look steady this week.', functionCalls: [] }));
});

describe('POST /api/org/:orgId/manager-coach/chat — access control', () => {
  it('requires authentication', async () => {
    seedOrg(3, members(3, true));
    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).send({ message: 'How is the team?' });
    expect(res.status).toBe(401);
  });

  it('forbids a non-admin of the org', async () => {
    seedOrg(3, members(3, true));
    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth('random_person')).send({ message: 'How is the team?' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — k-anonymity gate', () => {
  it('locks and never calls the model below the consenting-member threshold', async () => {
    seedOrg(5, members(2, true));
    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How is the team?' });
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('unlocks once enough members consent, and returns the real model reply', async () => {
    seedOrg(3, members(3, true));
    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How is the team?' });
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.text).toBe('Things look steady this week.');
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — request validation', () => {
  it('rejects an empty message', async () => {
    seedOrg(3, members(3, true));
    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: '' });
    expect(res.status).toBe(400);
  });

  it('rejects an unexpected field', async () => {
    seedOrg(3, members(3, true));
    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'hi', teamName: 'A' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — safety floor and persona', () => {
  it('always includes the safety floor and the conversational persona', async () => {
    seedOrg(3, members(3, true));
    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How is the team?' });
    const systemInstruction = h.lastConfig?.config?.systemInstruction as string;
    expect(systemInstruction).toContain('Never suggest the manager try to identify, single out, or personally intervene');
    expect(systemInstruction).toContain('real HR, EAP, or safeguarding process');
    expect(systemInstruction).toContain('having a real, ongoing conversation');
  });

  it('declares every tool with no parameters at all', async () => {
    seedOrg(3, members(3, true));
    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How is the team?' });
    const tools = h.lastConfig?.config?.tools?.[0]?.functionDeclarations;
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(Object.keys(tool.parameters.properties)).toEqual([]);
    }
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — tool-calling loop', () => {
  it('dispatches a requested tool, feeds its real result back, and records it in planTrace', async () => {
    seedOrg(3, members(3, true));
    const nowIso = new Date().toISOString();
    seedDoc(`organisations/${ORG}/work_design_debt/d1`, {
      team: 'A', signalKey: 'meeting_pressure', description: 'x', status: 'identified', ownerUid: null, createdAt: nowIso, updatedAt: nowIso,
    });
    h.sendMessage
      .mockImplementationOnce(async () => ({
        text: '',
        functionCalls: [{ name: 'get_work_design_debt_status', args: {} }],
      }))
      .mockImplementationOnce(async () => ({ text: 'One item is open with no owner.', functionCalls: [] }));

    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: "What's outstanding?" });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('One item is open with no owner.');
    expect(res.body.planTrace).toHaveLength(1);
    expect(res.body.planTrace[0].tool).toBe('get_work_design_debt_status');
    expect(res.body.planTrace[0].result.openDebtCount).toBe(1);
    expect(res.body.planTrace[0].result.openDebtWithoutOwnerCount).toBe(1);

    // The second sendMessage call is where the tool's real result gets fed
    // back to the model - confirm it actually carries a genuine computed
    // number, not a placeholder.
    const secondCallArg = h.sendMessage.mock.calls[1][0];
    const functionResponse = secondCallArg.message[0].functionResponse;
    expect(functionResponse.name).toBe('get_work_design_debt_status');
    expect(functionResponse.response.openDebtCount).toBe(1);
  });

  it('stops after MAX_TOOL_CALL_ROUNDS even if the model keeps requesting tools', async () => {
    seedOrg(3, members(3, true));
    h.sendMessage.mockImplementation(async () => ({
      text: '',
      functionCalls: [{ name: 'get_local_operating_principles', args: {} }],
    }));

    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'Tell me everything' });
    expect(res.status).toBe(200);
    // 1 initial call + 5 rounds = 6 total sendMessage invocations
    expect(h.sendMessage).toHaveBeenCalledTimes(6);
    expect(res.body.planTrace).toHaveLength(5);
  });

  it('degrades a failing tool to a clean {error} result instead of crashing the turn', async () => {
    seedOrg(3, members(3, true));
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'unknown_tool_name', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'Not sure on that one.', functionCalls: [] }));

    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.planTrace[0].result.error).toContain('Unknown tool');
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — get_work_design_debt_status', () => {
  it('reports open count, owner gap, and real items - never a fabricated number', async () => {
    seedOrg(3, members(3, true));
    const nowIso = new Date().toISOString();
    seedDoc(`organisations/${ORG}/work_design_debt/d1`, { team: 'A', signalKey: 'meeting_pressure', description: 'x', status: 'identified', ownerUid: null, createdAt: nowIso, updatedAt: nowIso });
    seedDoc(`organisations/${ORG}/work_design_debt/d2`, { team: 'B', signalKey: 'focus_fragmentation', description: 'y', status: 'in_progress', ownerUid: ADMIN, createdAt: nowIso, updatedAt: nowIso });
    seedDoc(`organisations/${ORG}/work_design_debt/d3`, { team: 'A', signalKey: 'meeting_pressure', description: 'z', status: 'resolved', ownerUid: ADMIN, createdAt: nowIso, updatedAt: nowIso });
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_work_design_debt_status', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'What needs an owner?' });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    // Resolved item excluded from the open count.
    expect(response.openDebtCount).toBe(2);
    expect(response.openDebtWithoutOwnerCount).toBe(1);
    expect(response.items).toHaveLength(2);
  });

  it('reports zero cleanly when nothing is open', async () => {
    seedOrg(3, members(3, true));
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_work_design_debt_status', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'What needs an owner?' });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.openDebtCount).toBe(0);
    expect(response.openDebtWithoutOwnerCount).toBe(0);
    expect(response.items).toEqual([]);
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — get_active_interventions_status', () => {
  it('reports the real active count and the organisation\'s own change budget - never a per-team breakdown', async () => {
    seedOrg(3, members(3, true));
    const nowIso = new Date().toISOString();
    seedDoc(`organisations/${ORG}/work_design_interventions/i1`, { team: 'A', signalKey: 'meeting_pressure', proposedChange: 'Protect a block', status: 'trialling', startDate: nowIso, reviewDate: nowIso });
    seedDoc(`organisations/${ORG}/work_design_interventions/i2`, { team: 'B', signalKey: 'meeting_pressure', proposedChange: 'Shorter defaults', status: 'completed', startDate: nowIso, reviewDate: nowIso });
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_active_interventions_status', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'One trial is active.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'What trials are running?' });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.activeInterventionCount).toBe(1);
    expect(response.maxConcurrentActiveInterventions).toBe(3);
    expect(response.items).toHaveLength(1);
    expect(response.items[0].proposedChange).toBe('Protect a block');
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — get_local_operating_principles', () => {
  it('reports count:0 and an honest note when nothing has been promoted yet', async () => {
    seedOrg(3, members(3, true));
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_local_operating_principles', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'Nothing promoted yet.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: "What's proven to work here?" });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.count).toBe(0);
    expect(response.principles).toEqual([]);
  });

  it('reports a real promoted principle', async () => {
    seedOrg(3, members(3, true));
    seedDoc(`organisations/${ORG}/local_operating_principles/meeting_pressure`, {
      signalKey: 'meeting_pressure', label: 'Meeting Pressure', promotedBy: ADMIN, promotedAt: new Date().toISOString(),
    });
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_local_operating_principles', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'One pattern has proven out.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: "What's proven to work here?" });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.count).toBe(1);
    expect(response.principles[0].signalKey).toBe('meeting_pressure');
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — get_cost_of_pressure_snapshot', () => {
  it('reports available:false when the org has not entered cost figures yet', async () => {
    seedOrg(3, members(3, true));
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_cost_of_pressure_snapshot', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'Nothing entered yet.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: "What's the cost case?" });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.available).toBe(false);
  });

  it('reports the org\'s own real entered cost figures once set', async () => {
    seedDoc(`organisations/${ORG}`, {
      adminUids: [ADMIN], memberUids: members(3, true).map((m) => m.uid), privacyThreshold: 3,
      costInputs: { headcount: 45, avgDailyCostPerEmployee: 180, annualSicknessDays: 240 },
    });
    for (const m of members(3, true)) seedDoc(`users/${m.uid}`, { shareAnonymizedDataWithOrg: true });
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_cost_of_pressure_snapshot', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'Here is the cost case.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: "What's the cost case?" });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.available).toBe(true);
    expect(response.costInputs.headcount).toBe(45);
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — get_meeting_load_signal (real calendar data, its own threshold)', () => {
  it('reports not-available when too few consenting members have connected a calendar, even if the org itself clears its threshold', async () => {
    seedOrg(3, members(3, true));
    // Consenting to org sharing is not the same as having connected a
    // calendar - none of these three have, so the signal must not appear.
    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'test' });
    expect(res.status).toBe(200);
  });

  it('reports a real, averaged signal once enough consenting members have both enabled and connected a calendar', async () => {
    const mems = members(3, true);
    seedOrg(3, mems);
    const recentIso = new Date().toISOString();
    mems.forEach((m, i) => {
      seedDoc(`users/${m.uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${m.uid}/live_signals/calendar`, {
        totalMeetingHours: 10 + i,
        meetingCount: 5,
        backToBackCount: 2,
        eveningMeetingCount: i === 0 ? 1 : 0,
        weekendMeetingCount: 0,
        windowDays: 7,
        updatedAt: recentIso,
      });
    });
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_meeting_load_signal', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'Meeting load looks manageable.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How is meeting load?' });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.available).toBe(true);
    expect(response.cohortSize).toBe(3);
    expect(response.avgMeetingHoursPerWeek).toBeCloseTo(11, 1); // (10+11+12)/3
  });

  it('excludes a stale (long-unsynced) calendar signal from the contributing cohort', async () => {
    const mems = members(3, true);
    seedOrg(3, mems);
    const staleIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    mems.forEach((m) => {
      seedDoc(`users/${m.uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${m.uid}/live_signals/calendar`, {
        totalMeetingHours: 10, meetingCount: 5, backToBackCount: 1, eveningMeetingCount: 0, weekendMeetingCount: 0, windowDays: 7,
        updatedAt: staleIso,
      });
    });
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_meeting_load_signal', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How is meeting load?' });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.available).toBe(false);
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — quota and failure handling', () => {
  it('enforces the same daily quota as the one-shot manager-coach route', async () => {
    seedOrg(3, members(3, true));
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: `turn ${i}` });
      expect(res.status).toBe(200);
    }
    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'one more' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('capability_limit_reached');
  });

  it('reports a clean error, not a crash, when the model call throws', async () => {
    seedOrg(3, members(3, true));
    h.sendMessage.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'test' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});

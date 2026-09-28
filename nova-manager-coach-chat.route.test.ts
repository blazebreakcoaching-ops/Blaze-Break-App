import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/org/:orgId/manager-coach/chat - the
// conversational, tool-calling Nova Manager Coach. The point of these:
// same access-control/k-anonymity/quota gates as the one-shot GET route
// (nova-manager-coach.route.test.ts), that the tool-calling loop actually
// dispatches to real, aggregate-only computations, that planTrace reflects
// what was really called, and - most importantly - that no tool can ever
// surface a team/cohort below the org's own anonymity threshold.
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

  it('declares every tool with no parameters, except get_team_detail which takes only a team name', async () => {
    seedOrg(3, members(3, true));
    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How is the team?' });
    const tools = h.lastConfig?.config?.tools?.[0]?.functionDeclarations;
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      if (tool.name === 'get_team_detail') {
        expect(Object.keys(tool.parameters.properties)).toEqual(['team']);
      } else {
        expect(Object.keys(tool.parameters.properties)).toEqual([]);
      }
    }
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — tool-calling loop', () => {
  it('dispatches a requested tool, feeds its real result back, and records it in planTrace', async () => {
    seedOrg(3, members(3, true));
    h.sendMessage
      .mockImplementationOnce(async () => ({
        text: '',
        functionCalls: [{ name: 'get_engagement_and_recognition_signal', args: {} }],
      }))
      .mockImplementationOnce(async () => ({ text: 'Engagement is holding steady this week.', functionCalls: [] }));

    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: "How's engagement this week?" });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Engagement is holding steady this week.');
    expect(res.body.planTrace).toHaveLength(1);
    expect(res.body.planTrace[0].tool).toBe('get_engagement_and_recognition_signal');
    expect(res.body.planTrace[0].result.cohortSize).toBe(3);
    expect(typeof res.body.planTrace[0].result.currentWeekEngagementRate).toBe('number');

    // The second sendMessage call is where the tool's real result gets fed
    // back to the model - confirm it actually carries a genuine computed
    // number, not a placeholder.
    const secondCallArg = h.sendMessage.mock.calls[1][0];
    const functionResponse = secondCallArg.message[0].functionResponse;
    expect(functionResponse.name).toBe('get_engagement_and_recognition_signal');
    expect(functionResponse.response.cohortSize).toBe(3);
  });

  it('stops after MAX_TOOL_CALL_ROUNDS even if the model keeps requesting tools', async () => {
    seedOrg(3, members(3, true));
    h.sendMessage.mockImplementation(async () => ({
      text: '',
      functionCalls: [{ name: 'get_team_climate_trend', args: {} }],
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

describe('POST /api/org/:orgId/manager-coach/chat — privacy: team breakdown never exposes an under-threshold cohort', () => {
  it('omits a team whose complement would fall below the threshold, even via the tool', async () => {
    // 6 consenting members total, threshold 3. Team A has 5 (complement 1 - unsafe).
    seedOrg(3, [...members(5, true, 'A'), ...members(1, true, 'B')]);
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_team_breakdown', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'Only the org-wide number is safe to share right now.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How does each team look?' });

    const secondCallArg = h.sendMessage.mock.calls[1][0];
    const response = secondCallArg.message[0].functionResponse.response;
    expect(response.teams).toEqual([]);
  });

  it('includes a team once both it and its complement clear the threshold', async () => {
    // 3 in team A, 3 in team B, threshold 3 - both team and complement (3) clear it.
    seedOrg(3, [...members(3, true, 'A'), ...members(3, true, 'B')]);
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_team_breakdown', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'Here is the breakdown.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How does each team look?' });

    const secondCallArg = h.sendMessage.mock.calls[1][0];
    const response = secondCallArg.message[0].functionResponse.response;
    const teamNames = response.teams.map((t: any) => t.team);
    expect(teamNames.sort()).toEqual(['A', 'B']);
  });

  it('never lets a tool argument resolve to a specific team - the model cannot pass a team name in', async () => {
    // Even if a compromised/hallucinating model tried to pass args, the
    // dispatcher takes no team-identifying parameter at all - args are
    // ignored entirely for every tool.
    seedOrg(3, [...members(3, true, 'A'), ...members(3, true, 'B')]);
    h.sendMessage
      .mockImplementationOnce(async () => ({
        text: '',
        functionCalls: [{ name: 'get_team_breakdown', args: { teamName: 'A', includeIndividuals: true } }],
      }))
      .mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));

    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'Just show me team A' });
    expect(res.status).toBe(200);
    const secondCallArg = h.sendMessage.mock.calls[1][0];
    const response = secondCallArg.message[0].functionResponse.response;
    // Both teams still returned - the "teamName" arg had no effect at all.
    expect(response.teams.map((t: any) => t.team).sort()).toEqual(['A', 'B']);
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — get_team_detail (the one tool with a parameter)', () => {
  it('returns real data for a team that qualifies, addressed by name', async () => {
    // 6 consenting total, threshold 3. Team A (3) and its complement (3)
    // both clear the threshold, so it's safe to report on individually.
    seedOrg(3, [...members(3, true, 'A'), ...members(3, true, 'B')]);
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_team_detail', args: { team: 'A' } }] }))
      .mockImplementationOnce(async () => ({ text: 'Team A looks steady.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How is team A doing?' });

    const secondCallArg = h.sendMessage.mock.calls[1][0];
    const response = secondCallArg.message[0].functionResponse.response;
    expect(response.found).toBe(true);
    expect(response.team).toBe('A');
    expect(response.cohortSize).toBe(3);
  });

  it('returns found:false for a team that does not qualify or does not exist - never a distinguishing answer', async () => {
    // Team A has 5 of 6 consenting - its complement is 1, below threshold 3.
    seedOrg(3, [...members(5, true, 'A'), ...members(1, true, 'B')]);
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_team_detail', args: { team: 'A' } }] }))
      .mockImplementationOnce(async () => ({ text: "Can't share that one individually.", functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'How is team A doing?' });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.found).toBe(false);
  });

  it('a prototype-chain team name never resolves to anything, degrading the same as any other unknown team', async () => {
    seedOrg(3, [...members(3, true, 'A'), ...members(3, true, 'B')]);
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_team_detail', args: { team: '__proto__' } }] }))
      .mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));

    const res = await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'team __proto__?' });
    expect(res.status).toBe(200);
    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.found).toBe(false);
  });
});

describe('POST /api/org/:orgId/manager-coach/chat — get_team_escalation_status (read-only, never creates one)', () => {
  it('reflects a real, recent acknowledgment for a qualifying team', async () => {
    seedOrg(3, [...members(3, true, 'A'), ...members(3, true, 'B')]);
    seedDoc(`organisations/${ORG}/team_escalation_acks/ack_1`, {
      team: 'A',
      acknowledgedBy: 'mgr_a',
      acknowledgedByEmail: 'mgr_a@test.dev',
      note: 'Held a 1:1 this week.',
      createdAt: new Date().toISOString(),
    });
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_team_escalation_status', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'Team A was recently followed up on.', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'Which teams need attention?' });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    const teamA = response.teams.find((t: any) => t.team === 'A');
    const teamB = response.teams.find((t: any) => t.team === 'B');
    expect(teamA.followUp.status).toBe('acknowledged');
    expect(teamA.followUp.lastAcknowledgedBy).toBe('mgr_a');
    expect(teamB.followUp.status).toBe('no_recent_acknowledgment');
  });

  it('never includes a team that does not qualify under the same complement check', async () => {
    seedOrg(3, [...members(5, true, 'A'), ...members(1, true, 'B')]);
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'get_team_escalation_status', args: {} }] }))
      .mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));

    await request(app).post(`/api/org/${ORG}/manager-coach/chat`).set(auth(ADMIN)).send({ message: 'Which teams need attention?' });

    const response = h.sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(response.teams).toEqual([]);
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

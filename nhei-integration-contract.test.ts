import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Integration contracts for the already-existing system. These tests
// supplement the pure-unit tests; they do not substitute for real E2E QA.
const source = (path: string) => readFileSync(path, 'utf8');

describe('NHEI integration contracts', () => {
  it('routes adaptive learning through the existing engine, only after opt-in', () => {
    const server = source('server.ts');
    expect(server).toContain('p?.allowAdaptiveIntelligence === true');
    expect(server).toContain('p.allowNovaMemory === true && p.allowNovaUseSavedMemories === true');
    expect(server).toContain('selectRoute(candidates, bandwidth, sessionState, adaptiveContext)');
  });
  it('preserves fail-closed default and private permissions', () => {
    expect(source('src/lib/nova-brain.ts')).toContain('allowAdaptiveIntelligence: false');
    expect(source('firestore.rules')).toContain("'allowAdaptiveIntelligence'");
    expect(source('firestore.rules')).toContain("'canonicalKey', 'dataZone'");
  });
  it('connects the low-energy interface and Second Memory', () => {
    const hub = source('src/components/RecoveryIntelligenceHub.tsx');
    expect(hub).toContain('<SecondMemoryCard />');
    expect(hub).toContain('toggleFloorMode');
    expect(hub).toContain('/api/user/resume-prompt');
    const server = source('server.ts');
    expect(server).toContain('app.get("/api/nova/second-memory"');
    expect(server).toContain('app.post("/api/nova/second-memory"');
    expect(server).toContain('app.delete("/api/nova/second-memory"');
  });
  it('shows when learning actually affected a recommendation and offers review', () => {
    const hub = source('src/components/RecoveryIntelligenceHub.tsx');
    expect(hub).toContain('decision?.adaptiveLearningUsed === true');
    expect(hub).toContain("decision.adaptiveExplanation.basis === 'explicit_preference'");
    expect(hub).toContain("navigateToTab('privacy')");
    expect(hub).toContain('Review Nova learning and feedback');
  });
  it('lets Nova connect the existing recovery and privacy areas', () => {
    const tools = source('nova-tools.ts');
    expect(tools).toContain("recovery_intelligence: 'Recovery Intelligence'");
    expect(tools).toContain("privacy: 'Privacy Controls'");
  });
});

describe('Nova privacy regressions', () => {
  it('scopes saved chat and feedback records to the authenticated account', () => {
    const chat = source('src/components/NovaChat.tsx');
    expect(chat).toContain('readScopedNovaStorage("nova_chat_history")');
    expect(chat).toContain('writeScopedNovaStorage("nova_chat_history"');
    expect(chat).not.toContain('localStorage.getItem("nova_chat_history")');
    expect(chat).toContain("localStorage.getItem('blaze_profile_uid')");
    const app = source('src/App.tsx');
    expect(app).toContain("key={user?.uid ?? 'signed-out'}");
  });

  it('checks current server permissions before new memories are written', () => {
    const rules = source('firestore.rules');
    expect(rules).toContain("nova_permissions/current).data.allowNovaMemory == true");
    expect(rules).toContain("nova_permissions/current).data.allowNovaUseSavedMemories == true");
    const memory = source('src/lib/nova-brain.ts');
    expect(memory).toContain("localStorage.getItem('blaze_profile_uid') !== uid");
  });

  it('allows users to inspect, correct, erase and reset adaptive learning', () => {
    const server = source('server.ts');
    expect(server).toContain('app.get("/api/recovery/my-feedback"');
    expect(server).toContain('app.delete("/api/recovery/my-feedback/:id"');
    expect(server).toContain('app.post("/api/recovery/reset-adaptive-learning"');
    const ui = source('src/components/AdaptiveFeedbackHistory.tsx');
    expect(ui).toContain('Reset adaptive feedback');
    expect(ui).toContain('action:');
  });
});

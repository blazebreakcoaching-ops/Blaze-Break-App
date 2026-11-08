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
  it('lets Nova connect the existing recovery and privacy areas', () => {
    const tools = source('nova-tools.ts');
    expect(tools).toContain("recovery_intelligence: 'Recovery Intelligence'");
    expect(tools).toContain("privacy: 'Privacy Controls'");
  });
});

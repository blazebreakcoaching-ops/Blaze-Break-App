import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { CALENDAR_PROTECTION_EXECUTION_ENABLED } from './nova-calendar-protection-service';
import { novaAgenticJourneyEnabled } from './nova-tools';
import { nheiEducationalModeIsEnabled } from './nhei-educational-mode-flag';

// Nova / NHEI / Super Nova integration-readiness guarantees (Batch 5).
// These lock the current safe state so a later change cannot quietly
// activate unfinished agentic capability, wire personal NHEI processing
// into a route, or let a model produce customer scores.
const server = fs.readFileSync('server.ts', 'utf8');

describe('unfinished agentic capabilities stay off by default', () => {
  it('real calendar execution is hard-disabled in code (not an env switch)', () => {
    expect(CALENDAR_PROTECTION_EXECUTION_ENABLED).toBe(false);
  });

  it('the agentic journey needs an explicit "true"', () => {
    for (const v of [undefined, '', '1', 'yes', 'TRUE', 'on']) expect(novaAgenticJourneyEnabled(v)).toBe(false);
    expect(novaAgenticJourneyEnabled('true')).toBe(true);
  });

  it('NHEI educational mode needs an explicit "true" (and separately, governance)', () => {
    for (const v of [undefined, '', '1', 'TRUE']) expect(nheiEducationalModeIsEnabled(v)).toBe(false);
    expect(server).toMatch(/nheiEducationalModeIsEnabledNow\(\) && await isNheiModeEnabledInGovernance\(/);
  });
});

describe('NHEI personal intelligence requires explicit permissions', () => {
  it('protects Second Memory routes with authentication and App Check', () => {
    for (const route of [
      'get("/api/nova/second-memory"',
      'post("/api/nova/second-memory"',
      'patch("/api/nova/second-memory/:id"',
      'delete("/api/nova/second-memory"',
      'delete("/api/nova/second-memory/:id"',
    ]) {
      expect(server).toContain(
        `app.${route}, verifyAppCheck, authenticateFirebaseUser`
      );
    }
  });

  it('requires active permission before creating Second Memory notes', () => {
    expect(server).toContain('transaction.get(permissionsRef)');
    expect(server).toContain('if (!mayUseSecondMemory(permissionSnap.data()))');
    expect(server).toContain('transaction.create(ref');
  });

  it('requires three permissions before using adaptive outcome history', () => {
    expect(server).toContain('p?.allowAdaptiveIntelligence === true');
    expect(server).toContain('p.allowNovaMemory === true');
    expect(server).toContain('p.allowNovaUseSavedMemories === true');
    expect(server).toContain('adaptiveContext = undefined;');
  });

  it('scopes personal intelligence reads to the authenticated user', () => {
    expect(server).toContain('secondMemoryCollection(user.uid)');
    expect(server).toContain('.collection("recovery_routing_decisions")');
    expect(server).toContain('adaptInterventionCandidates(candidates, adaptiveContext)');
  });
});

describe('Nova never generates customer scores or evidence', () => {
  it('no structured model response schema contains a numeric field', () => {
    expect(server).not.toMatch(/Type\.(NUMBER|INTEGER)/);
  });

  it('diagnostic scores are computed deterministically; the fallback text is not a fixed conclusion', () => {
    expect(server).toMatch(/const dims = computeDimensionScores\(answers\)/);
    expect(server).toMatch(/buildDiagnoseFallbackAnalysis\(profile,/);
    expect(server).not.toMatch(/biologically impossible|primary energy leak is completely clear/);
  });

  it("Nova's trend context uses generated insight wording, never stored explanation text", () => {
    for (const doc of ['recovery_debt', 'energy_trend', 'mood_trend']) {
      expect(server).toContain(`const insight = toCustomerInsight('${doc}', docSnap.data(), Date.now());`);
    }
  });

  it('user-authored memory and profile text enters Nova only through the untrusted-data sanitiser', () => {
    expect(server).toMatch(/asUntrustedContextText\(m\.content\)/);
    expect(server).not.toMatch(/\$\{m\.content\}/);
  });
});

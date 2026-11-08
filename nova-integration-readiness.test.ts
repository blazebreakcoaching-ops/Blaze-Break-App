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

describe('personal NHEI processing is not wired into any route', () => {
  it('server.ts imports only consent, export, educational and knowledge-review NHEI functions', () => {
    const nheiImports = [...server.matchAll(/import \{([^}]+)\} from '\.\/nhei-[^']+';/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim()).filter(Boolean));
    expect(nheiImports.sort()).toEqual([
      'NHEI_CONSENT_PURPOSES', 'NHEI_KNOWLEDGE_REVIEWER_ROLE', 'buildNheiEducationalChatAddendum',
      'exportAllNheiData', 'getNheiConsent', 'handleNheiKnowledgeReviewRequest', 'importKnowledgeContentLibrary',
      'isNheiModeEnabledInGovernance', 'isValidNheiConsentPurpose', 'listAllKnowledgeEntriesForReview',
      'nheiEducationalModeIsEnabledNow', 'setNheiConsent', 'withdrawNheiConsent',
    ].sort());
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

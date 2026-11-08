import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Static contracts, not a substitute for real shared-browser UI or API tests.
const source = readFileSync('src/components/RecoveryIntelligenceHub.tsx', 'utf8');

describe('Recovery Intelligence member separation', () => {
  it('invalidates pending responses on account switches and unmount', () => {
    expect(source).toContain('const accountUid = user?.uid ?? null');
    expect(source).toContain('const requestGeneration = useRef(0)');
    expect(source).toContain('requestGeneration.current += 1');
    expect(source).toContain('return () => { requestGeneration.current += 1; }');
    expect(source).toContain('setDecision(null); setDirection(null); setPendingOutcomeCheck(null)');
  });

  it('requires the same signed-in user and request generation before displaying data', () => {
    expect(source).toContain('auth.currentUser?.uid !== uid || generation !== requestGeneration.current');
    expect(source).toContain('auth.currentUser?.uid === uid && generation === requestGeneration.current');
    expect(source).toContain('if (!uid || uid !== accountUid) return');
  });

  it('cannot post the previous account recommendation after a sign-in change', () => {
    expect(source).toContain('if (!decisionId || !uid || uid !== accountUid) return false');
  });

  it('preserves feedback choices until their authenticated save succeeds', () => {
    expect(source).toContain('const saved = await reportOutcome(');
    expect(source).toContain('if (saved) setPendingOutcomeCheck(null)');
    expect(source).toContain('setOutcomeError(');
  });

  it('keeps the low-energy view local and scoped to each account', () => {
    expect(source).toContain("'blaze_floor_mode_' + accountUid");
    expect(source).toContain("'blaze_floor_mode_' + uid");
    expect(source).toContain('aria-pressed={floorMode}');
    expect(source).toContain('!floorMode && auth.currentUser && <RecoveryInsightsPanel />');
  });

  it('restores real unfinished recovery journeys without cross-account leakage', () => {
    expect(source).toContain("secureApiFetch('/api/user/resume-prompt')");
    expect(source).toContain("generation === requestGeneration.current");
    expect(source).toContain("const RESUME_TABS = new Set(['plan', 'diagnose', 'recover'])");
    expect(source).toContain("setResumePrompt(null)");
    expect(source).toContain("!floorMode && (");
    expect(source).toContain("RESUME_TABS.has(resumePrompt.tab)");
  });

  it('reuses the shared i18n title without changing any stored recovery data', () => {
    expect(source).toContain('t("title.recovery_intelligence")');
  });
});

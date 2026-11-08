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
    expect(source).toContain('if (!decisionId || !accountUid || auth.currentUser?.uid !== accountUid) return');
  });

  it('reuses the shared i18n title without changing any stored recovery data', () => {
    expect(source).toContain('t("title.recovery_intelligence")');
  });
});

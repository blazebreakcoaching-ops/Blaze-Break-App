import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');
describe('Phase 2 Nova recovery-session unification', () => {
  it('keeps Recovery Hub requests and expansion within one login session', () => {
    const hub = source('src/components/RecoveryIntelligenceHub.tsx');
    expect(hub).toContain('auth.currentUser === session && generation === requestGeneration.current');
    expect(hub).toContain('auth.currentUser !== session || generation !== requestGeneration.current');
    expect(hub).toContain('}, [accountUid, user, fetchDecision]);');
    expect(hub).toContain('setShowExplore(false); setExpandedTool(null); setShowMoodCheck(false);');
    expect(hub).not.toContain('auth.currentUser?.uid === uid');
  });
  it('does not render stale overlapping routing requests or clear a newer feedback question', () => {
    const hub = source('src/components/RecoveryIntelligenceHub.tsx');
    expect(hub).toContain('const requestId = ++latestDecisionRequest.current;');
    expect(hub).toContain('requestId !== latestDecisionRequest.current');
    expect(hub).toContain('latestDecisionRequest.current += 1;');
    expect(hub).toContain('current?.decisionId === answeredId ? null : current');
    expect(hub).toContain("localizedRecoveryModuleName(locale, pendingOutcomeCheck.selectedModule)");
    expect(hub).toContain("t('feedback.outcome')");
    expect(hub).toContain('t(option.labelKey)');
    expect(hub).not.toContain('moduleDisplayName(pendingOutcomeCheck.selectedModule)');
  });
  it('keeps Second Memory member-owned across same-UID login changes', () => {
    const card = source('src/components/SecondMemoryCard.tsx');
    expect(card).toContain('auth.currentUser !== user || generation !== requestGeneration.current');
    expect(card).toContain('auth.currentUser === user && generation === requestGeneration.current');
    expect(card).toContain('}, [uid, user]);');
    expect(card).toContain('setConfirmErase(false)');
    expect(card).not.toContain('auth.currentUser?.uid === uid');
  });
  it('retains memory review/correction after opt-out without old-session UI writes', () => {
    const review = source('src/components/PastNovaMemoriesReview.tsx');
    expect(review).toContain('}, [user]);');
    expect(review).toContain('const uid = accountUid;');
    expect(review).toContain('auth.currentUser !== user');
    expect(review).toContain('deleteDoc(ref)');
    expect(review).not.toContain('addNovaMemory(');
  });
  it('does not reintroduce the older main-only competing outcome helper', () => {
    const server = source('server.ts');
    expect(server).toContain('app.post("/api/recovery/routing-outcome"');
    expect(server).toContain('await db.runTransaction(async (tx) =>');
    expect(source('recovery-feedback-rights.route.test.ts')).toContain('reset blocks delayed old feedback');
  });
});

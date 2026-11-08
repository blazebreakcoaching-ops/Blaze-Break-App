import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Source contracts guard the security-sensitive orchestration boundaries.
// They complement, but do not replace, Firestore emulator and HTTP E2E tests.
const read = (p: string) => readFileSync(p, 'utf8');

describe('NHEI security/coordination contracts', () => {
  it('uses a transaction when creating Second Memory notes', () => {
    const server = read('server.ts');
    const start = server.indexOf('app.post("/api/nova/second-memory"');
    const end = server.indexOf('app.patch("/api/nova/second-memory/:id"', start);
    const createHandler = server.slice(start, end);
    expect(createHandler).toContain('runTransaction');
    expect(createHandler).toContain('transaction.get(permissionsRef)');
    expect(createHandler).toContain('transaction.get(collection.limit(MAX_OPEN_LOOPS))');
    expect(createHandler).toContain('transaction.create(ref');
  });

  it('keeps forgotten ratings forgotten after a late retry', () => {
    const code = read('nhei-routing-outcome.ts');
    expect(code).toContain('previous.feedbackWithdrawnAt');
    const server = read('server.ts');
    expect(server).toContain('feedbackWithdrawnAt: new Date().toISOString()');
  });

  it('keeps explicit personal memory access after opt-out separate from coaching context', () => {
    const review = read('src/components/PastNovaMemoriesReview.tsx');
    expect(review).toContain("collection(db, 'users', uid, 'nova_memories')");
    expect(review).toContain("deleteDoc(ref)");
    expect(review).not.toContain('addNovaMemory(');
    const centre = read('src/components/MemoryCentre.tsx');
    expect(centre).toContain('<PastNovaMemoriesReview />');
  });

  it('discards stale memory review responses and errors after account changes', () => {
    const review = read('src/components/PastNovaMemoriesReview.tsx');
    expect(review).toContain('requestGeneration.current += 1');
    expect(review).toContain('setBusy(false);');
    expect(review).toContain('auth.currentUser?.uid !== uid || requestGeneration.current !== generation');
    expect(review).toContain('auth.currentUser?.uid === uid && requestGeneration.current === generation');
  });

  it('isolates Second Memory asynchronous work by signed-in user and generation', () => {
    const card = read('src/components/SecondMemoryCard.tsx');
    expect(card).toContain('requestGeneration.current += 1');
    expect(card).toContain('auth.currentUser?.uid !== uid || generation !== requestGeneration.current');
    expect(card).toContain('generation === requestGeneration.current');
    expect(card).toContain('setConfirmErase(false)');
  });

  it('does not show another account pending recovery recommendations or prompts', () => {
    const hub = read('src/components/RecoveryIntelligenceHub.tsx');
    expect(hub).toContain('const accountUid = user?.uid ?? null');
    expect(hub).toContain('setDecision(null); setDirection(null); setPendingOutcomeCheck(null); setResumePrompt(null)');
    expect(hub).toContain('auth.currentUser?.uid !== uid || generation !== requestGeneration.current');
    expect(hub).toContain('setResumePrompt(data.hasIncomplete ? data : null)');
    expect(hub).toContain('requestGeneration.current += 1');
  });

  it('allows Nova to recommend the existing central journey and privacy controls', () => {
    const server = read('server.ts');
    expect(server).toContain('recovery_intelligence (one useful step');
    expect(server).toContain('privacy (review Nova learning consent');
    const validator = read('nova-tools.ts');
    expect(validator).toContain("recovery_intelligence: 'Recovery Intelligence'");
    expect(validator).toContain("privacy: 'Privacy Controls'");
  });
});

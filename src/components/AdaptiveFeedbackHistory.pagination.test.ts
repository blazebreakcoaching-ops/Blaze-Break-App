import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const feedbackUi = readFileSync('src/components/AdaptiveFeedbackHistory.tsx', 'utf8');
describe('Adaptive feedback review navigation', () => {
  it('keeps owner and request-generation guards before displaying paged history', () => {
    expect(feedbackUi).toContain('generation.current !== requestGeneration');
    expect(feedbackUi).toContain('auth.currentUser !== user');
    expect(feedbackUi).toContain('auth.currentUser === user');
    expect(feedbackUi).toContain('}, [user]);');
    expect(feedbackUi).toContain('setNextCursor(data.nextCursor ?? null)');
  });
  it('offers older feedback without creating a second privacy store', () => {
    expect(feedbackUi).toContain("'?cursor=' + encodeURIComponent(cursor)");
    expect(feedbackUi).toContain("t('feedback.older')");
    expect(feedbackUi).toContain("t('feedback.loadingOlder')");
    expect(feedbackUi).toContain('setNextCursor(null)');
    expect(feedbackUi).toContain('secureApiFetch(path)');
  });
});

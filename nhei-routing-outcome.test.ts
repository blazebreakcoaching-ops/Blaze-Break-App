import { describe, expect, it } from 'vitest';
import { planOutcomeTransition } from './nhei-routing-outcome';
const now = '2026-11-08T00:00:00.000Z';
describe('idempotent routing outcomes', () => {
  it('does not count a repeated start', () => {
    expect(planOutcomeTransition({ startedAt: now }, 'started', null, now)).toMatchObject({ allowed: true, changed: false, counter: null });
  });
  it('does not count a repeated completion', () => {
    expect(planOutcomeTransition({ outcome: 'completed', helpfulness: 'better' }, 'completed', 'better', now))
      .toMatchObject({ allowed: true, changed: false, counter: null });
  });
  it('permits a correction without adding another completion', () => {
    expect(planOutcomeTransition({ outcome: 'completed', helpfulness: 'better' }, 'completed', 'not_really', now))
      .toMatchObject({ allowed: true, changed: true, counter: null, patch: { helpfulness: 'not_really' } });
  });
  it('does not reopen a declined recommendation', () => {
    expect(planOutcomeTransition({ outcome: 'declined' }, 'started', null, now).allowed).toBe(false);
  });
  it('requires a helpfulness rating for completed actions', () => {
    expect(planOutcomeTransition({}, 'completed', null, now).allowed).toBe(false);
  });
});

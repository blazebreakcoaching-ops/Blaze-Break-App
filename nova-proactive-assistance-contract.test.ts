import { describe, it, expect } from 'vitest';
import { generateProactiveSuggestions, type NovaProactiveSuggestionInput } from './nova-proactive-assistance-contract';

const BASE: NovaProactiveSuggestionInput = {
  statedGoal: null,
  voluntarilySharedObligation: null,
  capacityBand: null,
  hasAuthorisedCalendarActionContext: false,
  hasAuthorisedTaskContext: false,
  priorUserConfirmedPlan: null,
};

describe('generateProactiveSuggestions', () => {
  it('returns nothing when there is no obligation/goal and no authorised context at all', () => {
    expect(generateProactiveSuggestions(BASE)).toEqual([]);
  });

  it('never suggests calendar_protection without hasAuthorisedCalendarActionContext, even with a stated obligation', () => {
    const suggestions = generateProactiveSuggestions({ ...BASE, voluntarilySharedObligation: 'Finish the report', hasAuthorisedCalendarActionContext: false });
    expect(suggestions.find((s) => s.category === 'calendar_protection')).toBeUndefined();
  });

  it('suggests calendar_protection once an obligation exists AND calendar action context is authorised', () => {
    const suggestions = generateProactiveSuggestions({ ...BASE, voluntarilySharedObligation: 'Finish the report', hasAuthorisedCalendarActionContext: true });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].category).toBe('calendar_protection');
    expect(suggestions[0].stage).toBe('possible_suggestion');
    expect(suggestions[0].description).toContain('Finish the report');
  });

  it('never suggests task_deferral without hasAuthorisedTaskContext, even with a stated goal', () => {
    const suggestions = generateProactiveSuggestions({ ...BASE, statedGoal: 'Ship the release', hasAuthorisedTaskContext: false });
    expect(suggestions.find((s) => s.category === 'task_deferral')).toBeUndefined();
  });

  it('suggests task_deferral once a goal exists AND task context is authorised', () => {
    const suggestions = generateProactiveSuggestions({ ...BASE, statedGoal: 'Ship the release', hasAuthorisedTaskContext: true });
    expect(suggestions.some((s) => s.category === 'task_deferral')).toBe(true);
  });

  it('every suggestion names exactly what it was based on - nothing hidden', () => {
    const suggestions = generateProactiveSuggestions({ ...BASE, voluntarilySharedObligation: 'Finish the report', hasAuthorisedCalendarActionContext: true, capacityBand: 'low_bandwidth' });
    expect(suggestions[0].basedOn.length).toBeGreaterThan(0);
    expect(suggestions[0].basedOn.some((b) => b.includes('capacity'))).toBe(true);
  });

  it('a prior confirmed plan combined with low capacity produces a reconsideration suggestion', () => {
    const suggestions = generateProactiveSuggestions({ ...BASE, priorUserConfirmedPlan: 'ship the feature Friday', capacityBand: 'low_bandwidth' });
    expect(suggestions.some((s) => s.description.includes('ship the feature Friday'))).toBe(true);
  });

  it('a prior confirmed plan with normal capacity produces no reconsideration suggestion', () => {
    const suggestions = generateProactiveSuggestions({ ...BASE, priorUserConfirmedPlan: 'ship the feature Friday', capacityBand: 'some_bandwidth' });
    expect(suggestions).toEqual([]);
  });

  it('every returned suggestion is stage possible_suggestion, never any later stage', () => {
    const suggestions = generateProactiveSuggestions({ ...BASE, voluntarilySharedObligation: 'x', hasAuthorisedCalendarActionContext: true, hasAuthorisedTaskContext: true });
    expect(suggestions.every((s) => s.stage === 'possible_suggestion')).toBe(true);
  });

  it('has zero import statements - no persistence, no connector, no model call', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(new URL('./nova-proactive-assistance-contract.ts', import.meta.url), 'utf8');
    expect(content).not.toMatch(/^\s*import\s/m);
  });
});

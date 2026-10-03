import { describe, it, expect } from 'vitest';
import {
  summarizeBoundariesChosen, ChosenBoundaryInput,
  summarizeBoundariesPractising, DraftScriptInput,
  summarizeWhatUsuallyTestsThem,
  summarizeWhatHasWorked, WorkedOutcomeInput,
  countCapacityProtected,
  summarizeExperimentsTrying, ExperimentInput,
} from './my-boundaries-engine';
import { BoundaryMemoryEntry } from './boundary-outcome-engine';

describe('Boundaries I’ve Chosen: real decisions only, most recent first', () => {
  it('skips decisions with no choice made yet', () => {
    const input: ChosenBoundaryInput[] = [
      { demandDescription: 'Cover a shift', choice: null, createdAt: '2026-01-01T00:00:00Z' },
      { demandDescription: 'Join a steering group', choice: 'decline', createdAt: '2026-01-02T00:00:00Z' },
    ];
    const result = summarizeBoundariesChosen(input);
    expect(result).toHaveLength(1);
    expect(result[0].demandDescription).toBe('Join a steering group');
    expect(result[0].choiceLabel).toBeTruthy();
  });

  it('caps at five entries', () => {
    const input: ChosenBoundaryInput[] = Array.from({ length: 8 }, (_, i) => ({
      demandDescription: `Demand ${i}`, choice: 'accept' as const, createdAt: '2026-01-01T00:00:00Z',
    }));
    expect(summarizeBoundariesChosen(input)).toHaveLength(5);
  });
});

describe('Practising: only unfinished drafts, never saved/finished scripts', () => {
  it('filters to draft status only', () => {
    const input: DraftScriptInput[] = [
      { title: 'Draft one', status: 'draft', createdAt: '2026-01-01T00:00:00Z' },
      { title: 'Saved one', status: 'saved', createdAt: '2026-01-02T00:00:00Z' },
    ];
    const result = summarizeBoundariesPractising(input);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Draft one');
  });
});

describe('What Usually Tests Them: reuses the Memory Graph’s own consistency gate', () => {
  it('stays silent when no source has a real pattern yet', () => {
    const entries: BoundaryMemoryEntry[] = [{ source: 'manager', outcome: 'respected_it' }];
    expect(summarizeWhatUsuallyTestsThem(entries)).toEqual([]);
  });

  it('surfaces a real pattern once the sample is consistent', () => {
    const entries: BoundaryMemoryEntry[] = [
      { source: 'client', outcome: 'pushed_back' },
      { source: 'client', outcome: 'pushed_back' },
      { source: 'client', outcome: 'i_backed_down' },
    ];
    const result = summarizeWhatUsuallyTestsThem(entries);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('client');
    expect(result[0].pattern).toMatch(/real pushback/);
  });
});

describe('What Has Worked: reuses the Evidence Base’s own minimum-sample gate', () => {
  it('stays unavailable below the minimum sample', () => {
    const outcomes: WorkedOutcomeInput[] = [{ fearedOutcome: 'expect_pushback', outcome: 'respected_it' }];
    expect(summarizeWhatHasWorked(outcomes).available).toBe(false);
  });

  it('becomes available with a real, consistent sample', () => {
    const outcomes: WorkedOutcomeInput[] = [
      { fearedOutcome: 'expect_pushback', outcome: 'respected_it' },
      { fearedOutcome: 'expect_pushback', outcome: 'respected_it' },
      { fearedOutcome: 'expect_pushback', outcome: 'negotiated' },
    ];
    const result = summarizeWhatHasWorked(outcomes);
    expect(result.available).toBe(true);
    expect(result.line).toMatch(/accepted without conflict/);
  });

  it('ignores records with no feared outcome or no real outcome yet', () => {
    const outcomes: WorkedOutcomeInput[] = [
      { fearedOutcome: null, outcome: 'respected_it' },
      { fearedOutcome: 'expect_pushback', outcome: null },
    ];
    expect(summarizeWhatHasWorked(outcomes).available).toBe(false);
  });
});

describe('Capacity I’ve Protected: a real count, never an estimate', () => {
  it('counts only outcomes that actually earned Capacity Protected', () => {
    const outcomes = [{ capacityProtectedApplied: true }, { capacityProtectedApplied: false }, { capacityProtectedApplied: true }];
    expect(countCapacityProtected(outcomes)).toBe(2);
  });
});

describe('Experiments I’m Trying: unresolved Conditional Yes decisions, honestly framed', () => {
  it('only includes conditional_yes decisions', () => {
    const input: ExperimentInput[] = [
      { demandDescription: 'Extra report', choice: 'accept', conditionalYesLever: null, conditionalYesMessage: null, createdAt: '2026-01-01T00:00:00Z' },
      { demandDescription: 'New project', choice: 'conditional_yes', conditionalYesLever: 'deadline', conditionalYesMessage: 'If the deadline moves.', createdAt: '2026-01-02T00:00:00Z' },
    ];
    const result = summarizeExperimentsTrying(input);
    expect(result).toHaveLength(1);
    expect(result[0].demandDescription).toBe('New project');
    expect(result[0].leverLabel).toBeTruthy();
  });

  it('caps at five entries', () => {
    const input: ExperimentInput[] = Array.from({ length: 7 }, (_, i) => ({
      demandDescription: `Demand ${i}`, choice: 'conditional_yes' as const, conditionalYesLever: null, conditionalYesMessage: null, createdAt: '2026-01-01T00:00:00Z',
    }));
    expect(summarizeExperimentsTrying(input)).toHaveLength(5);
  });
});

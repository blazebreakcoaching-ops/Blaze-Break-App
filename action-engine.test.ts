import { describe, it, expect } from 'vitest';
import {
  pickCandidateInsight, CandidateInsight,
  ACTION_WORTHINESS_ORDER, ACTION_WORTHINESS_LABELS, ACTION_WORTHINESS_QUESTION,
  shouldEnterControllabilityGate, leadsToNothingNeedsFixing,
  CONTROLLABILITY_ORDER, CONTROLLABILITY_LABELS, CONTROLLABILITY_GUIDANCE,
  SHARED_RESPONSIBILITY_PROMPTS,
  OUTSIDE_CONTROL_RESPONSE_ORDER, OUTSIDE_CONTROL_RESPONSE_LABELS, OUTSIDE_CONTROL_LINE, OUTSIDE_CONTROL_HANDOFF_TAB,
  NOTHING_NEEDS_FIXING_LINE, NOTHING_NEEDS_FIXING_ORDER, NOTHING_NEEDS_FIXING_LABELS,
  ACTION_LADDER_ORDER, ACTION_LADDER_LABELS, ACTION_LADDER_DESCRIPTIONS,
  EVIDENCE_LEVEL_ORDER, EVIDENCE_LEVEL_LABELS, evidenceLevelForInsightState,
  ONE_ACTIVE_EXPERIMENT_LINE, ACTIVE_EXPERIMENT_CONFLICT_ORDER, ACTIVE_EXPERIMENT_CONFLICT_LABELS,
} from './action-engine';
import { RediscoveryClue, WorkloadCheckSnapshot } from './rediscovery-engine';

describe('Candidate insight surfacing: real signals only, recurring pattern over single remark', () => {
  const clue = (answer: string, id = 'c1'): RediscoveryClue => ({ id, source: 'one_less_thing_why', prompt: 'p', answer, createdAt: '2026-01-01T00:00:00Z' });
  const snapshot = (titles: string[]): WorkloadCheckSnapshot => ({ mustDoTitles: titles });

  it('returns null when there is nothing real to surface', () => {
    expect(pickCandidateInsight([], [])).toBeNull();
  });

  it('prefers a genuine recurring must-do pattern over a single clue', () => {
    const history = [snapshot(['Client report']), snapshot(['Client report']), snapshot(['Client report'])];
    const clues = [clue('I felt guilty saying no')];
    const result = pickCandidateInsight(history, clues);
    expect(result?.source).toBe('workload_recurring_must_do');
    expect(result?.confidenceLevel).toBe(2);
    expect(result?.text).toMatch(/client report/);
  });

  it('falls back to the most recent raw clue as a level-1 observation', () => {
    const clues = [clue('I felt guilty saying no', 'c1'), clue('older one', 'c2')];
    const result = pickCandidateInsight([], clues);
    expect(result).toEqual<CandidateInsight>({
      text: 'I felt guilty saying no', source: 'raw_clue', confidenceLevel: 1, clueId: 'c1',
    });
  });

  it('does not claim a pattern from a thin workload history', () => {
    const history = [snapshot(['Client report']), snapshot(['Client report'])];
    expect(pickCandidateInsight(history, [])).toBeNull();
  });
});

describe('Insight Card: confirming worth, never auto-promoting every pattern into an action', () => {
  it('has all four spec options', () => {
    expect(ACTION_WORTHINESS_QUESTION).toBe('Does that feel worth working on?');
    expect(ACTION_WORTHINESS_ORDER).toHaveLength(4);
    expect(Object.keys(ACTION_WORTHINESS_LABELS)).toHaveLength(4);
  });

  it('only a clear yes enters the Controllability Gate', () => {
    expect(shouldEnterControllabilityGate('yes_change_it')).toBe(true);
    expect(shouldEnterControllabilityGate('understand_first')).toBe(false);
    expect(shouldEnterControllabilityGate('not_really')).toBe(false);
    expect(shouldEnterControllabilityGate('not_now')).toBe(false);
  });

  it('not_really and not_now both lead to Nothing Needs Fixing', () => {
    expect(leadsToNothingNeedsFixing('not_really')).toBe(true);
    expect(leadsToNothingNeedsFixing('not_now')).toBe(true);
    expect(leadsToNothingNeedsFixing('yes_change_it')).toBe(false);
    expect(leadsToNothingNeedsFixing('understand_first')).toBe(false);
  });
});

describe('Controllability Gate: shapes the response, never forces a project', () => {
  it('has all five branches with guidance', () => {
    expect(CONTROLLABILITY_ORDER).toHaveLength(5);
    CONTROLLABILITY_ORDER.forEach((c) => {
      expect(CONTROLLABILITY_LABELS[c]).toBeTruthy();
      expect(CONTROLLABILITY_GUIDANCE[c]).toBeTruthy();
    });
  });

  it('"depends on someone else" is structured into three real parts', () => {
    expect(Object.keys(SHARED_RESPONSIBILITY_PROMPTS)).toEqual(['myPart', 'theirPart', 'ifTheySayNo']);
  });

  it('"mostly outside my control" never becomes a self-improvement task', () => {
    expect(OUTSIDE_CONTROL_LINE).toBe('This may not be something you can solve by trying harder.');
    expect(OUTSIDE_CONTROL_RESPONSE_ORDER).toHaveLength(6);
    expect(OUTSIDE_CONTROL_RESPONSE_ORDER.every((r) => OUTSIDE_CONTROL_RESPONSE_LABELS[r])).toBe(true);
  });

  it('only protect_capacity and ask_for_help hand off to a real tool', () => {
    expect(OUTSIDE_CONTROL_HANDOFF_TAB.protect_capacity).toBe('communicate');
    expect(OUTSIDE_CONTROL_HANDOFF_TAB.ask_for_help).toBe('communicate');
    expect(OUTSIDE_CONTROL_HANDOFF_TAB.reduce_impact).toBeUndefined();
    expect(OUTSIDE_CONTROL_HANDOFF_TAB.accept_uncertainty).toBeUndefined();
    expect(OUTSIDE_CONTROL_HANDOFF_TAB.change_what_can_change).toBeUndefined();
    expect(OUTSIDE_CONTROL_HANDOFF_TAB.understand_it).toBeUndefined();
  });
});

describe('Nothing Needs Fixing: a required, non-punitive outcome', () => {
  it('uses the exact spec line and four options, none of them requiring an action', () => {
    expect(NOTHING_NEEDS_FIXING_LINE).toBe('This may be something worth understanding, not something you need to turn into a project.');
    expect(NOTHING_NEEDS_FIXING_ORDER).toEqual(['leave_it_here', 'journal_about_it', 'keep_noticing', 'talk_to_nova']);
    expect(Object.keys(NOTHING_NEEDS_FIXING_LABELS)).toHaveLength(4);
  });
});

describe('Action Ladder: five levels, never pushed automatically', () => {
  it('has a label and description for every level', () => {
    expect(ACTION_LADDER_ORDER).toHaveLength(5);
    ACTION_LADDER_ORDER.forEach((level) => {
      expect(ACTION_LADDER_LABELS[level]).toBeTruthy();
      expect(ACTION_LADDER_DESCRIPTIONS[level]).toBeTruthy();
    });
  });
});

describe('Confidence / Evidence model: never jumps to a confident conclusion', () => {
  it('has all four levels', () => {
    expect(EVIDENCE_LEVEL_ORDER).toHaveLength(4);
    expect(Object.keys(EVIDENCE_LEVEL_LABELS)).toHaveLength(4);
  });

  it('a fresh nova_noticed insight is only a one-time observation', () => {
    expect(evidenceLevelForInsightState('nova_noticed', 0)).toBe('one_time_observation');
  });

  it('still_exploring is a possible pattern, not yet confirmed', () => {
    expect(evidenceLevelForInsightState('still_exploring', 0)).toBe('possible_pattern');
  });

  it('user_confirmed is a user-confirmed pattern', () => {
    expect(evidenceLevelForInsightState('user_confirmed', 1)).toBe('user_confirmed_pattern');
  });

  it('three or more confirmed experiments outrank confirmation alone', () => {
    expect(evidenceLevelForInsightState('user_confirmed', 3)).toBe('behaviourally_supported');
  });
});

describe('One Active Experiment principle', () => {
  it('has the exact spec line and three resolution choices', () => {
    expect(ONE_ACTIVE_EXPERIMENT_LINE).toBe("You already have something you're testing. Let's not turn recovery into another workload.");
    expect(ACTIVE_EXPERIMENT_CONFLICT_ORDER).toEqual(['keep_current', 'replace_it', 'save_for_later']);
    expect(Object.keys(ACTIVE_EXPERIMENT_CONFLICT_LABELS)).toHaveLength(3);
  });
});

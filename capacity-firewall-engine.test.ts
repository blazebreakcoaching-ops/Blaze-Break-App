import { describe, it, expect } from 'vitest';
import {
  QUICK_PAUSE_FIT_ORDER, QUICK_PAUSE_FIT_LABELS, QUICK_PAUSE_PROMPT, needsCapacityGate,
  CAPACITY_NOT_CHECKED_LABEL, describeBufferAfterAccepting, buildCapacityGateScenarios,
  MOVE_IT_SCENARIO_LINE, DECLINE_SCENARIO_LINE,
  SQUEEZE_AREA_ORDER, SQUEEZE_AREA_LABELS, shouldShowCostOfYesFollowup, COST_OF_YES_NOT_FREE_LINE,
  FIREWALL_CHOICE_ORDER, FIREWALL_CHOICE_LABELS,
  ACCEPT_RATIONALE_ORDER, ACCEPT_RATIONALE_LABELS, shouldAskWhatMovingToMakeRoom,
  CONDITIONAL_YES_LEVER_ORDER, CONDITIONAL_YES_LEVER_LABELS, buildConditionalYesMessage,
  DELEGATE_QUESTION, DEFER_QUESTION, CLARIFICATION_QUESTIONS,
  CAPACITY_FIREWALL_INTRO_LINE, CAPACITY_FIREWALL_INTRO_CTA,
  containsCapacityFirewallBannedPhrase, CAPACITY_FIREWALL_BANNED_PHRASES,
} from './capacity-firewall-engine';

describe('Quick Pause: fast fit check, no forced detour for a confident answer', () => {
  it('has all four fit answers', () => {
    expect(QUICK_PAUSE_FIT_ORDER).toEqual(['yes', 'not_comfortably', 'no', 'need_more_info']);
    expect(Object.keys(QUICK_PAUSE_FIT_LABELS)).toHaveLength(4);
  });
  it('only routes to the fuller gate for an unsure answer', () => {
    expect(needsCapacityGate('yes')).toBe(false);
    expect(needsCapacityGate('no')).toBe(false);
    expect(needsCapacityGate('not_comfortably')).toBe(true);
    expect(needsCapacityGate('need_more_info')).toBe(true);
  });
  it('uses the exact spec prompt', () => {
    expect(QUICK_PAUSE_PROMPT).toBe('Before you answer - can today actually afford this?');
  });
});

describe('Capacity Gate: scenario math from real data only, never a fabricated value', () => {
  it('maps buffer size to a tightness band at the documented boundaries', () => {
    expect(describeBufferAfterAccepting(58, 51)).toBe('tight'); // buffer 7, matches spec worked example
    expect(describeBufferAfterAccepting(90, 40)).toBe('comfortable');
    expect(describeBufferAfterAccepting(55, 51)).toBe('very_tight'); // buffer 4
    expect(describeBufferAfterAccepting(50, 60)).toBe('over_capacity');
  });
  it('never invents a number when capacity has not been checked', () => {
    const scenarios = buildCapacityGateScenarios({ capacityScore: null, plannedLoad: null });
    expect(scenarios.accept.toLowerCase()).toContain("don't have today's capacity checked");
    expect(scenarios.move).toBe(MOVE_IT_SCENARIO_LINE);
    expect(scenarios.decline).toBe(DECLINE_SCENARIO_LINE);
  });
  it('matches the spec worked example wording when real data exists', () => {
    const scenarios = buildCapacityGateScenarios({ capacityScore: 58, plannedLoad: 51 });
    expect(scenarios.accept).toBe('Your remaining buffer becomes tight.');
  });
  it('"move it" never names a specific day with more room - no per-day forecast exists to back that', () => {
    expect(MOVE_IT_SCENARIO_LINE.toLowerCase()).not.toMatch(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
  });
  it('has the exact "capacity not checked" label', () => {
    expect(CAPACITY_NOT_CHECKED_LABEL).toBe('Capacity not checked today');
  });
});

describe('Cost of Yes: visible trade-off, never prescribing what must be sacrificed', () => {
  it('has all eight spec answers', () => {
    expect(SQUEEZE_AREA_ORDER).toHaveLength(8);
    expect(Object.keys(SQUEEZE_AREA_LABELS)).toHaveLength(8);
  });
  it('only follows up when a real squeeze was named', () => {
    expect(shouldShowCostOfYesFollowup([])).toBe(false);
    expect(shouldShowCostOfYesFollowup(['nothing_i_have_room'])).toBe(false);
    expect(shouldShowCostOfYesFollowup(['sleep'])).toBe(true);
    // "Nothing - I genuinely have room" is an exclusive answer (the UI clears
    // other selections when it's chosen) - its presence always means no trade-off.
    expect(shouldShowCostOfYesFollowup(['sleep', 'nothing_i_have_room'])).toBe(false);
  });
  it('never tells the user which area they must sacrifice', () => {
    expect(COST_OF_YES_NOT_FREE_LINE.toLowerCase()).not.toMatch(/you must|you should give up|sacrifice your/);
  });
});

describe('Choice screen: all seven options, Conditional Yes as prominent as Decline', () => {
  it('has exactly the seven spec options in spec order', () => {
    expect(FIREWALL_CHOICE_ORDER).toEqual(['accept', 'conditional_yes', 'negotiate', 'delegate', 'defer', 'decline', 'need_more_info']);
    expect(Object.keys(FIREWALL_CHOICE_LABELS)).toHaveLength(7);
  });
});

describe('Accept: never shamed, never labelled a boundary failure', () => {
  it('has all three rationale options', () => {
    expect(ACCEPT_RATIONALE_ORDER).toHaveLength(3);
    expect(Object.keys(ACCEPT_RATIONALE_LABELS)).toHaveLength(3);
  });
  it('only asks what is moving when the buffer is actually tight', () => {
    expect(shouldAskWhatMovingToMakeRoom('comfortable')).toBe(false);
    expect(shouldAskWhatMovingToMakeRoom('tight')).toBe(true);
    expect(shouldAskWhatMovingToMakeRoom('very_tight')).toBe(true);
    expect(shouldAskWhatMovingToMakeRoom('over_capacity')).toBe(true);
    expect(shouldAskWhatMovingToMakeRoom('unknown')).toBe(false);
  });
});

describe('Conditional Yes: deterministic, complete without an AI call', () => {
  it('has all eight levers', () => {
    expect(CONDITIONAL_YES_LEVER_ORDER).toHaveLength(8);
    expect(Object.keys(CONDITIONAL_YES_LEVER_LABELS)).toHaveLength(8);
  });
  it('builds a real message for every lever, with and without a detail', () => {
    expect(buildConditionalYesMessage('deadline', '')).toBe('Yes, if the deadline moves.');
    expect(buildConditionalYesMessage('deadline', 'Friday')).toBe('Yes, if the deadline moves to Friday.');
    expect(buildConditionalYesMessage('timing', '')).toBe('Yes, just not today.');
    expect(buildConditionalYesMessage('custom', 'Yes, but only the research part.')).toBe('Yes, but only the research part.');
    for (const lever of CONDITIONAL_YES_LEVER_ORDER) {
      expect(buildConditionalYesMessage(lever, '').length).toBeGreaterThan(0);
    }
  });
});

describe('Delegate / Defer / Need More Information', () => {
  it('uses the exact spec questions', () => {
    expect(DELEGATE_QUESTION).toBe("What part doesn't need to stay with you?");
    expect(DEFER_QUESTION).toBe('When would this realistically fit?');
  });
  it('has all five clarification questions', () => {
    expect(CLARIFICATION_QUESTIONS).toHaveLength(5);
  });
});

describe('First-use introduction', () => {
  it('uses the exact spec copy', () => {
    expect(CAPACITY_FIREWALL_INTRO_LINE).toBe('Before more gets added to your life, make the cost visible.');
    expect(CAPACITY_FIREWALL_INTRO_CTA).toBe('Check My Capacity');
  });
});

describe('banned-phrase guardrail: no risk percentages, no gamification, no boundary coercion', () => {
  it('flags overclaiming and gamified phrases', () => {
    expect(containsCapacityFirewallBannedPhrase('Your burnout risk is high.')).toBe(true);
    expect(containsCapacityFirewallBannedPhrase("You've kept a 5-day boundary streak!")).toBe(true);
    expect(containsCapacityFirewallBannedPhrase('Your remaining buffer becomes tight.')).toBe(false);
  });
  it('every built-in scenario/cost-of-yes/intro line passes the guardrail', () => {
    const lines = [
      QUICK_PAUSE_PROMPT, MOVE_IT_SCENARIO_LINE, DECLINE_SCENARIO_LINE, COST_OF_YES_NOT_FREE_LINE,
      CAPACITY_FIREWALL_INTRO_LINE, CAPACITY_FIREWALL_INTRO_CTA, DELEGATE_QUESTION, DEFER_QUESTION,
      ...CLARIFICATION_QUESTIONS,
      ...CONDITIONAL_YES_LEVER_ORDER.map((l) => buildConditionalYesMessage(l, '')),
    ];
    for (const line of lines) expect(containsCapacityFirewallBannedPhrase(line)).toBe(false);
  });
  it('CAPACITY_FIREWALL_BANNED_PHRASES is non-empty', () => {
    expect(CAPACITY_FIREWALL_BANNED_PHRASES.length).toBeGreaterThan(0);
  });
});

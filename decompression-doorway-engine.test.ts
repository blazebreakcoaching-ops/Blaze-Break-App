import { describe, it, expect } from 'vitest';
import {
  LEAVING_PRESETS,
  ARRIVING_STATE_PRESETS,
  SUGGESTED_PAIRINGS,
  RETURN_TO_ME_PAIRINGS,
  WORK_FROM_HOME_THRESHOLDS,
  UNFINISHED_BUSINESS_ORDER,
  UNFINISHED_BUSINESS_LABELS,
  DISPOSITION_ORDER,
  DISPOSITION_LABELS,
  CAPACITY_VERY_LOW_CUTOFF,
  getArrivalQualityOptions,
  ARRIVAL_QUALITY_OPTIONS,
  LOW_CAPACITY_ARRIVAL_OPTIONS,
  reflectArrivalChoice,
  RITUAL_ANCHORS,
  DOORWAY_DEPTH_ORDER,
  DOORWAY_DEPTH_LABELS,
  DOORWAY_DEPTH_DURATION_LABEL,
  recommendDoorwayDepth,
  ARRIVAL_CHECK_ORDER,
  ARRIVAL_CHECK_BRANCHES,
  shouldOfferArrivalCheck,
  ARRIVAL_CHECK_ASK_INTERVAL,
  FOLLOWED_THROUGH_ORDER,
  suggestFollowUpTool,
  ROLE_WEIGHT_OPTIONS,
  SWITCHED_ON_REASON_ORDER,
  detectLowCapacityArrivalPattern,
  detectFrequentSkipPattern,
  MIN_SESSIONS_FOR_DOORWAY_PATTERN,
  shouldOfferDeeperRediscoveryQuestion,
  MIN_SESSIONS_FOR_DEEPER_REDISCOVERY,
  pairKeyFor,
  appendCapacityHistory,
  CAPACITY_HISTORY_MAX,
  containsBannedPhrase,
} from './decompression-doorway-engine';

describe('decompression-doorway-engine', () => {
  it('never pairs Manager with Human Being, the explicitly banned preset', () => {
    const banned = SUGGESTED_PAIRINGS.some(
      (p) => p.leaving.toLowerCase().includes('manager') && p.arriving.toLowerCase().includes('human being')
    );
    expect(banned).toBe(false);
  });

  it('keeps arriving presets as states/qualities, not more role labels', () => {
    // Arriving vocab should not just mirror the leaving role vocab verbatim.
    const overlap = ARRIVING_STATE_PRESETS.filter((a) => LEAVING_PRESETS.includes(a));
    expect(overlap.length).toBe(0);
  });

  it('supports two-way transitions, not just work to home', () => {
    const reverse = SUGGESTED_PAIRINGS.find((p) => p.leaving === 'Home' && p.arriving === 'Work');
    expect(reverse).toBeDefined();
  });

  it('supports Return to Me transitions ending in Me or Private Self', () => {
    expect(RETURN_TO_ME_PAIRINGS.length).toBeGreaterThan(0);
    RETURN_TO_ME_PAIRINGS.forEach((p) => {
      expect(['Me', 'Private Self']).toContain(p.arriving);
    });
  });

  it('offers work-from-home thresholds with no physical commute implied', () => {
    expect(WORK_FROM_HOME_THRESHOLDS.length).toBeGreaterThan(0);
    expect(WORK_FROM_HOME_THRESHOLDS.some((t) => t.toLowerCase().includes('commute'))).toBe(false);
  });

  it('maps every unfinished-business answer to a label and the disposition set is exactly four', () => {
    UNFINISHED_BUSINESS_ORDER.forEach((a) => expect(UNFINISHED_BUSINESS_LABELS[a]).toBeTruthy());
    expect(DISPOSITION_ORDER).toEqual(['park', 'schedule', 'needs_action_now', 'let_go']);
    DISPOSITION_ORDER.forEach((d) => expect(DISPOSITION_LABELS[d]).toBeTruthy());
  });

  it('never offers an unrealistic emotional performance when capacity is very low', () => {
    const lowOptions = getArrivalQualityOptions(true);
    expect(lowOptions).toEqual(LOW_CAPACITY_ARRIVAL_OPTIONS);
    expect(lowOptions).not.toContain('Playful');
    expect(lowOptions).not.toEqual(ARRIVAL_QUALITY_OPTIONS);
  });

  it('returns the full arrival quality set when capacity is not very low', () => {
    expect(getArrivalQualityOptions(false)).toEqual(ARRIVAL_QUALITY_OPTIONS);
  });

  it('reflects back a short honest line for any arrival choice, including an unmapped custom one', () => {
    expect(reflectArrivalChoice('Quiet')).toMatch(/quiet/i);
    expect(reflectArrivalChoice('Curious')).toBe("Curious. That's enough tonight.");
  });

  it('keeps CAPACITY_VERY_LOW_CUTOFF aligned with the rest of the app at 40', () => {
    expect(CAPACITY_VERY_LOW_CUTOFF).toBe(40);
  });

  it('offers a real list of ritual anchors with no forced single mandatory ritual', () => {
    expect(RITUAL_ANCHORS.length).toBeGreaterThan(5);
  });

  it('recommends the shortest doorway by default, and Deeper only when repeatedly difficult', () => {
    expect(recommendDoorwayDepth(false)).toBe('quick');
    expect(recommendDoorwayDepth(true)).toBe('deeper');
  });

  it('has exactly three depth tiers with matching labels and durations', () => {
    expect(DOORWAY_DEPTH_ORDER).toEqual(['quick', 'standard', 'deeper']);
    DOORWAY_DEPTH_ORDER.forEach((d) => {
      expect(DOORWAY_DEPTH_LABELS[d]).toBeTruthy();
      expect(DOORWAY_DEPTH_DURATION_LABEL[d]).toBeTruthy();
    });
  });

  it('branches the arrival check into exactly four responses, only one offering follow-up options', () => {
    expect(ARRIVAL_CHECK_ORDER).toEqual(['yes', 'mostly', 'not_really', 'not_sure']);
    expect(ARRIVAL_CHECK_BRANCHES.yes.options).toEqual([]);
    expect(ARRIVAL_CHECK_BRANCHES.mostly.options).toEqual([]);
    expect(ARRIVAL_CHECK_BRANCHES.not_really.options.length).toBeGreaterThan(0);
    expect(ARRIVAL_CHECK_BRANCHES.not_sure.options).toEqual([]);
  });

  it('only offers the arrival check sparingly, every third crossing', () => {
    expect(ARRIVAL_CHECK_ASK_INTERVAL).toBe(3);
    expect(shouldOfferArrivalCheck(0)).toBe(false);
    expect(shouldOfferArrivalCheck(1)).toBe(false);
    expect(shouldOfferArrivalCheck(2)).toBe(true);
    expect(shouldOfferArrivalCheck(5)).toBe(true);
  });

  it('suggests exactly one, smallest relevant tool per followed-through answer', () => {
    FOLLOWED_THROUGH_ORDER.forEach((a) => {
      const tool = suggestFollowUpTool(a);
      expect(tool).toBeTruthy();
    });
    expect(suggestFollowUpTool('the_conversation')).toBe('rumination_furnace');
    expect(suggestFollowUpTool('something_unfinished')).toBe('one_less_thing');
    expect(suggestFollowUpTool('work_notifications')).toBe('tomorrow_parking_list');
    expect(suggestFollowUpTool('couldnt_switch_off')).toBe('quick_reset');
    expect(suggestFollowUpTool('not_sure')).toBe('talk_to_nova');
  });

  it('captures role-weight clues without diagnosing', () => {
    expect(ROLE_WEIGHT_OPTIONS.length).toBeGreaterThan(0);
    expect(SWITCHED_ON_REASON_ORDER.length).toBeGreaterThan(0);
  });

  it('never flags a low-capacity-arrival pattern below the minimum sample size', () => {
    expect(detectLowCapacityArrivalPattern([{ capacity: 10 }, { capacity: 15 }])).toBe(false);
  });

  it('flags a low-capacity-arrival pattern once enough real low samples exist', () => {
    const entries = [{ capacity: 10 }, { capacity: 15 }, { capacity: 20 }, { capacity: 90 }];
    expect(detectLowCapacityArrivalPattern(entries)).toBe(true);
  });

  it('does not flag a low-capacity pattern when capacity is usually fine', () => {
    const entries = [{ capacity: 80 }, { capacity: 90 }, { capacity: 20 }, { capacity: 85 }];
    expect(detectLowCapacityArrivalPattern(entries)).toBe(false);
  });

  it('ignores unknown capacity entries when checking the minimum sample size', () => {
    const entries = [{ capacity: null }, { capacity: null }, { capacity: 10 }];
    expect(detectLowCapacityArrivalPattern(entries)).toBe(false);
  });

  it('never flags a frequent-skip pattern without enough real prompts', () => {
    expect(detectFrequentSkipPattern(2, 2)).toBe(false);
  });

  it('flags a frequent-skip pattern with enough prompts and a real majority skip rate', () => {
    expect(detectFrequentSkipPattern(MIN_SESSIONS_FOR_DOORWAY_PATTERN, 2)).toBe(true);
    expect(detectFrequentSkipPattern(MIN_SESSIONS_FOR_DOORWAY_PATTERN, 1)).toBe(false);
  });

  it('only offers the deeper rediscovery question with real history and never mid-overwhelm', () => {
    expect(shouldOfferDeeperRediscoveryQuestion(MIN_SESSIONS_FOR_DEEPER_REDISCOVERY, false)).toBe(true);
    expect(shouldOfferDeeperRediscoveryQuestion(MIN_SESSIONS_FOR_DEEPER_REDISCOVERY, true)).toBe(false);
    expect(shouldOfferDeeperRediscoveryQuestion(1, false)).toBe(false);
  });

  it('builds a stable, doc-id-safe key for a leaving/arriving pair', () => {
    expect(pairKeyFor('Work', 'Home')).toBe('work__home');
    expect(pairKeyFor('Prayer / Reflection', 'Work')).toBe(pairKeyFor('Prayer / Reflection', 'Work'));
    expect(pairKeyFor('Prayer / Reflection', 'Work')).not.toContain('/');
  });

  it('keeps capacity history bounded to the max window', () => {
    let history: (number | null)[] = [];
    for (let i = 0; i < CAPACITY_HISTORY_MAX + 5; i++) {
      history = appendCapacityHistory(history, i);
    }
    expect(history.length).toBe(CAPACITY_HISTORY_MAX);
    expect(history[history.length - 1]).toBe(CAPACITY_HISTORY_MAX + 4);
  });

  it('flags compliance-engine-sounding phrases and leaves ordinary copy alone', () => {
    expect(containsBannedPhrase('Transition protocol complete.')).toBe(true);
    expect(containsBannedPhrase("You're through.")).toBe(false);
  });

  it('keeps every built-in Nova line free of compliance-engine language', () => {
    ARRIVAL_CHECK_ORDER.forEach((r) => {
      expect(containsBannedPhrase(ARRIVAL_CHECK_BRANCHES[r].novaLine)).toBe(false);
    });
  });
});

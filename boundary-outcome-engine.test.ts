import { describe, it, expect } from 'vitest';
import {
  AFTERCARE_LINE, AFTERCARE_RESPONSE_ORDER, AFTERCARE_RESPONSE_LABELS,
  WAITING_FOR_RESPONSE_LINE, WAITING_CHOICE_ORDER, WAITING_CHOICE_LABELS,
  BOUNDARY_OUTCOME_QUESTION, BOUNDARY_OUTCOME_ORDER, BOUNDARY_OUTCOME_LABELS,
  outcomeHeldTheBoundary, outcomeReflectsRealReduction,
  FEARED_OUTCOME_ORDER, FEARED_OUTCOME_LABELS, WHAT_DO_YOU_EXPECT_QUESTION,
  MIN_PAIRS_FOR_EVIDENCE_BASE, buildEvidenceBaseResult, EvidencePair,
  EVIDENCE_BASE_FOLLOWUP_QUESTION, EVIDENCE_BASE_FOLLOWUP_ORDER, EVIDENCE_BASE_FOLLOWUP_LABELS,
  REQUEST_SOURCE_ORDER, REQUEST_SOURCE_LABELS, detectSourcePattern, BoundaryMemoryEntry,
  containsMemoryGraphBannedLabel, MEMORY_GRAPH_BANNED_LABELS,
} from './boundary-outcome-engine';

describe('Aftercare: offered once, never auto-reassuring', () => {
  it('uses the exact spec line', () => {
    expect(AFTERCARE_LINE).toBe("You've said it. Don't negotiate against yourself before they've even replied.");
  });
  it('has all five spec responses', () => {
    expect(AFTERCARE_RESPONSE_ORDER).toHaveLength(5);
    expect(Object.keys(AFTERCARE_RESPONSE_LABELS)).toHaveLength(5);
  });
});

describe('Waiting for response: never encourages repeated checking', () => {
  it('uses the exact spec line and three choices', () => {
    expect(WAITING_FOR_RESPONSE_LINE).toBe("No response yet doesn't mean the boundary went badly.");
    expect(WAITING_CHOICE_ORDER).toEqual(['wait', 'review_what_i_sent', 'talk_to_nova']);
    expect(Object.keys(WAITING_CHOICE_LABELS)).toHaveLength(3);
  });
});

describe('Boundary Outcome: closes the loop, never scored', () => {
  it('has all eight spec outcomes', () => {
    expect(BOUNDARY_OUTCOME_QUESTION).toBe('How did it go?');
    expect(BOUNDARY_OUTCOME_ORDER).toHaveLength(8);
    expect(Object.keys(BOUNDARY_OUTCOME_LABELS)).toHaveLength(8);
  });
  it('only respected_it/negotiated count as the boundary holding', () => {
    expect(outcomeHeldTheBoundary('respected_it')).toBe(true);
    expect(outcomeHeldTheBoundary('negotiated')).toBe(true);
    expect(outcomeHeldTheBoundary('pushed_back')).toBe(false);
    expect(outcomeHeldTheBoundary('i_backed_down')).toBe(false);
  });
  it('Capacity Protected only reflects a real, confirmed reduction - never backing down or softening', () => {
    expect(outcomeReflectsRealReduction('respected_it')).toBe(true);
    expect(outcomeReflectsRealReduction('negotiated')).toBe(true);
    expect(outcomeReflectsRealReduction('i_softened_it')).toBe(false);
    expect(outcomeReflectsRealReduction('i_backed_down')).toBe(false);
    expect(outcomeReflectsRealReduction('i_changed_my_mind')).toBe(false);
    expect(outcomeReflectsRealReduction('no_response')).toBe(false);
  });
});

describe('Personal Evidence Base: real history only, minimum sample before speaking up', () => {
  const pair = (feared: EvidencePair['feared'], outcome: EvidencePair['outcome']): EvidencePair => ({ feared, outcome });

  it('uses the exact spec question for capturing the feared outcome', () => {
    expect(WHAT_DO_YOU_EXPECT_QUESTION).toBe('What do you expect will happen?');
    expect(FEARED_OUTCOME_ORDER).toHaveLength(3);
    expect(Object.keys(FEARED_OUTCOME_LABELS)).toHaveLength(3);
  });

  it('stays silent below the minimum sample', () => {
    expect(MIN_PAIRS_FOR_EVIDENCE_BASE).toBe(3);
    const result = buildEvidenceBaseResult([pair('expect_pushback', 'respected_it'), pair('expect_pushback', 'respected_it')]);
    expect(result.available).toBe(false);
    expect(result.line).toBeNull();
  });

  it('matches the exact spec worked example once the sample and consistency are both real', () => {
    const result = buildEvidenceBaseResult([
      pair('expect_pushback', 'respected_it'),
      pair('expect_pushback', 'respected_it'),
      pair('expect_pushback', 'negotiated'),
    ]);
    expect(result.available).toBe(true);
    expect(result.line).toBe('You expected pushback on 3 recent boundaries. All 3 were accepted without conflict.');
  });

  it('does not claim a consistent pattern when the real history is actually mixed', () => {
    const result = buildEvidenceBaseResult([
      pair('expect_pushback', 'respected_it'),
      pair('expect_pushback', 'pushed_back'),
      pair('expect_pushback', 'respected_it'),
    ]);
    expect(result.available).toBe(false);
  });

  it('never generalises beyond pairs that actually feared pushback', () => {
    const result = buildEvidenceBaseResult([
      pair('expect_accepted', 'respected_it'),
      pair('expect_accepted', 'respected_it'),
      pair('expect_accepted', 'respected_it'),
    ]);
    expect(result.available).toBe(false);
    expect(result.fearedPushbackCount).toBe(0);
  });

  it('has the exact spec follow-up question and four answers', () => {
    expect(EVIDENCE_BASE_FOLLOWUP_QUESTION).toBe('Does seeing that change how risky saying no feels?');
    expect(EVIDENCE_BASE_FOLLOWUP_ORDER).toHaveLength(4);
    expect(Object.keys(EVIDENCE_BASE_FOLLOWUP_LABELS)).toHaveLength(4);
  });
});

describe('Boundary Memory Graph: behavioural patterns about situations, never labels on people', () => {
  const entry = (source: BoundaryMemoryEntry['source'], outcome: BoundaryMemoryEntry['outcome']): BoundaryMemoryEntry => ({ source, outcome });

  it('has all six request sources', () => {
    expect(REQUEST_SOURCE_ORDER).toHaveLength(6);
    expect(Object.keys(REQUEST_SOURCE_LABELS)).toHaveLength(6);
  });

  it('needs a real minimum sample before surfacing a source pattern', () => {
    expect(detectSourcePattern([entry('manager', 'respected_it'), entry('manager', 'respected_it')], 'manager')).toBeNull();
  });

  it('detects a real acceptance-dominant pattern', () => {
    const entries = [entry('manager', 'respected_it'), entry('manager', 'respected_it'), entry('manager', 'negotiated')];
    expect(detectSourcePattern(entries, 'manager')).toMatch(/generally been accepted/);
  });

  it('detects a real pushback-dominant pattern without labelling the person', () => {
    const entries = [entry('client', 'pushed_back'), entry('client', 'pushed_back'), entry('client', 'i_backed_down')];
    const pattern = detectSourcePattern(entries, 'client');
    expect(pattern).toMatch(/real pushback/);
    expect(containsMemoryGraphBannedLabel(pattern!)).toBe(false);
  });

  it('stays silent on a genuinely inconsistent history rather than forcing a verdict', () => {
    const entries = [entry('colleague', 'respected_it'), entry('colleague', 'pushed_back'), entry('colleague', 'something_else')];
    expect(detectSourcePattern(entries, 'colleague')).toBeNull();
  });

  it('flags character-label phrases, and the banned list is non-empty', () => {
    expect(containsMemoryGraphBannedLabel('My manager is toxic.')).toBe(true);
    expect(containsMemoryGraphBannedLabel('Manager requests have generally been accepted.')).toBe(false);
    expect(MEMORY_GRAPH_BANNED_LABELS.length).toBeGreaterThan(0);
  });
});

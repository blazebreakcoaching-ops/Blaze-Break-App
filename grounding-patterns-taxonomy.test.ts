import { describe, it, expect } from 'vitest';
import {
  computeConfidence, CONFIDENCE_COPY, PATTERN_DIMENSIONS, PATTERN_DIMENSION_ORDER,
  PATTERN_CATEGORIES, EXPLORE_QUESTION_SETS, VALUES_LIST,
  EMERGING_MIN_COUNT, RECURRING_MIN_COUNT, ESTABLISHED_MIN_COUNT, ESTABLISHED_MIN_SPAN_DAYS,
} from './grounding-patterns-taxonomy';

describe('computeConfidence', () => {
  it('returns null below the emerging threshold, no matter the span', () => {
    expect(computeConfidence(EMERGING_MIN_COUNT - 1, 365)).toBeNull();
    expect(computeConfidence(0, 0)).toBeNull();
  });

  it('returns emerging at exactly the emerging threshold', () => {
    expect(computeConfidence(EMERGING_MIN_COUNT, 1)).toBe('emerging');
  });

  it('returns recurring at exactly the recurring threshold, regardless of span', () => {
    expect(computeConfidence(RECURRING_MIN_COUNT, 1)).toBe('recurring');
  });

  it('does not return established on count alone - also requires the minimum span', () => {
    expect(computeConfidence(ESTABLISHED_MIN_COUNT, ESTABLISHED_MIN_SPAN_DAYS - 1)).toBe('recurring');
  });

  it('returns established once both the count and span thresholds are met', () => {
    expect(computeConfidence(ESTABLISHED_MIN_COUNT, ESTABLISHED_MIN_SPAN_DAYS)).toBe('established');
  });

  it('never demotes established back down just because count is high but span is short - still recurring, never emerging', () => {
    expect(computeConfidence(ESTABLISHED_MIN_COUNT + 10, 1)).toBe('recurring');
  });
});

describe('CONFIDENCE_COPY', () => {
  it('uses exploratory, non-declarative language - never "you have" or "you clearly are"', () => {
    for (const tier of ['emerging', 'recurring', 'established'] as const) {
      const copy = CONFIDENCE_COPY[tier].toLowerCase();
      expect(copy).not.toMatch(/you have\b|you suffer from|this proves|you clearly are/);
    }
  });

  it('has distinct copy for every confidence tier', () => {
    const values = Object.values(CONFIDENCE_COPY);
    expect(new Set(values).size).toBe(3);
  });
});

describe('PATTERN_DIMENSIONS taxonomy', () => {
  it('has the full 27-dimension taxonomy from the brief', () => {
    expect(PATTERN_DIMENSION_ORDER).toHaveLength(27);
  });

  it('assigns every dimension to a real category', () => {
    for (const id of PATTERN_DIMENSION_ORDER) {
      const dim = PATTERN_DIMENSIONS[id];
      expect(PATTERN_CATEGORIES[dim.category]).toBeDefined();
    }
  });

  it('gives every dimension a non-empty, tentative-voice description', () => {
    for (const id of PATTERN_DIMENSION_ORDER) {
      const desc = PATTERN_DIMENSIONS[id].description;
      expect(desc.length).toBeGreaterThan(0);
      expect(desc.toLowerCase()).not.toMatch(/you have\b|you suffer from|this proves|you clearly are/);
    }
  });

  it('has a complete explore-question set (opening + 5 questions) for every category', () => {
    for (const categoryId of Object.keys(PATTERN_CATEGORIES)) {
      const set = EXPLORE_QUESTION_SETS[categoryId as keyof typeof EXPLORE_QUESTION_SETS];
      expect(set).toBeDefined();
      expect(set.questions).toHaveLength(5);
      expect(set.openingTemplate('Test Label').length).toBeGreaterThan(0);
    }
  });
});

describe('VALUES_LIST', () => {
  it('includes the values named in the brief', () => {
    for (const v of ['Integrity', 'Compassion', 'Courage', 'Faith', 'Rest', 'Responsibility']) {
      expect(VALUES_LIST).toContain(v);
    }
  });
});

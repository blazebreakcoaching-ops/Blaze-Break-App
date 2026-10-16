import { describe, it, expect } from 'vitest';
import { countEventsByType, countByDimension, summarizeFeatureUsage, DEFAULT_PRODUCT_INTELLIGENCE_SAMPLE_THRESHOLD } from './product-intelligence';

describe('countEventsByType', () => {
  it('counts occurrences per eventType, most frequent first', () => {
    const events = [
      { eventType: 'recipe_started' },
      { eventType: 'recipe_completed' },
      { eventType: 'recipe_started' },
      { eventType: 'recipe_started' },
    ];
    expect(countEventsByType(events)).toEqual([
      { eventType: 'recipe_started', count: 3 },
      { eventType: 'recipe_completed', count: 1 },
    ]);
  });

  it('returns an empty array for no events', () => {
    expect(countEventsByType([])).toEqual([]);
  });
});

describe('countByDimension', () => {
  it('counts a given optional field, excluding events where it is absent', () => {
    const events = [
      { eventType: 'recipe_started', situationKey: 'slept_badly' },
      { eventType: 'recipe_started', situationKey: 'slept_badly' },
      { eventType: 'recipe_completed', situationKey: 'angry' },
      { eventType: 'recipe_feedback' }, // no situationKey at all
    ];
    expect(countByDimension(events, 'situationKey')).toEqual({ slept_badly: 2, angry: 1 });
  });

  it('excludes null and non-string values', () => {
    const events = [{ eventType: 'x', category: null }, { eventType: 'y', category: 42 }];
    expect(countByDimension(events, 'category')).toEqual({});
  });
});

describe('summarizeFeatureUsage', () => {
  it('reports total events and the per-type breakdown', () => {
    const events = Array.from({ length: 25 }, () => ({ eventType: 'movement_completed' }));
    const summary = summarizeFeatureUsage(events, 1);
    expect(summary.totalEvents).toBe(25);
    expect(summary.byEventType).toEqual([{ eventType: 'movement_completed', count: 25 }]);
  });

  it('gates sufficientSample on total event volume, never hiding the real counts either way', () => {
    const fewEvents = [{ eventType: 'movement_started' }, { eventType: 'movement_started' }];
    const summary = summarizeFeatureUsage(fewEvents, 20);
    expect(summary.totalEvents).toBe(2); // still reported, not hidden
    expect(summary.sufficientSample).toBe(false);
  });

  it('defaults to DEFAULT_PRODUCT_INTELLIGENCE_SAMPLE_THRESHOLD (20) when no threshold is given', () => {
    const events = Array.from({ length: 19 }, () => ({ eventType: 'x' }));
    const summary = summarizeFeatureUsage(events);
    expect(summary.sampleThreshold).toBe(20);
    expect(summary.sufficientSample).toBe(false);
    expect(DEFAULT_PRODUCT_INTELLIGENCE_SAMPLE_THRESHOLD).toBe(20);
  });
});

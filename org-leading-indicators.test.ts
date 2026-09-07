import { describe, it, expect } from 'vitest';
import {
  severityOf,
  directionNote,
  buildPrimaryIndicators,
  buildDimensionIndicators,
  sortByAttention,
} from './org-leading-indicators';
import { TrendResult } from './org-risk-trend';

const t = (direction: TrendResult['direction'], delta: number | null): TrendResult => ({ direction, delta });

describe('severityOf: bands stay in sync with the dashboard colours', () => {
  it('low below 35, moderate 35-59, elevated 60+', () => {
    expect(severityOf(10)).toBe('low');
    expect(severityOf(34)).toBe('low');
    expect(severityOf(35)).toBe('moderate');
    expect(severityOf(59)).toBe('moderate');
    expect(severityOf(60)).toBe('elevated');
    expect(severityOf(100)).toBe('elevated');
  });
  it('null when there is no data, not a fake zero band', () => {
    expect(severityOf(null)).toBeNull();
  });
});

describe('directionNote: descriptive, never predictive', () => {
  it('describes worsening/improving/steady in the past tense, with magnitude', () => {
    expect(directionNote(t('worsening', 8))).toContain('Worsening over the last ~4 weeks');
    expect(directionNote(t('improving', -5))).toContain('Improving over the last ~4 weeks');
    expect(directionNote(t('stable', 1))).toContain('Holding steady');
  });
  it('is honest about missing history rather than inventing a trend', () => {
    expect(directionNote(t('unknown', null))).toContain('Not enough history');
    expect(directionNote(null)).toContain('Not enough history');
  });
  it('never uses predictive language (no will/expect/forecast/predict)', () => {
    for (const d of [t('worsening', 8), t('improving', -5), t('stable', 0), t('unknown', null)]) {
      const note = directionNote(d).toLowerCase();
      expect(note).not.toMatch(/will|expect|forecast|predict|likely/);
    }
  });
});

describe('buildPrimaryIndicators: three separate signals with their own direction', () => {
  it('surfaces mood and climate as distinct indicators, each with its own trend', () => {
    const out = buildPrimaryIndicators({
      overall: 55, mood: 70, climate: 40,
      overallTrend: t('stable', 1), moodTrend: t('worsening', 12), climateTrend: t('improving', -4),
    });
    const mood = out.find(i => i.key === 'mood')!;
    const climate = out.find(i => i.key === 'climate')!;
    expect(mood.direction).toBe('worsening');
    expect(mood.severity).toBe('elevated');
    expect(climate.direction).toBe('improving');
    expect(climate.severity).toBe('moderate');
  });
  it('degrades gracefully when a signal has no data', () => {
    const out = buildPrimaryIndicators({ overall: null, mood: null, climate: null });
    for (const i of out) {
      expect(i.level).toBeNull();
      expect(i.severity).toBeNull();
      expect(i.direction).toBe('unknown');
    }
  });
});

describe('buildDimensionIndicators: current levels only, honest about direction', () => {
  it('labels the six HSE dimensions and never fabricates a per-dimension trend', () => {
    const out = buildDimensionIndicators({ demands: 78, control: 20, support: 15, relationships: 30, role: 10, change: 55 });
    expect(out).toHaveLength(6);
    const demands = out.find(i => i.label.startsWith('Workload'))!;
    expect(demands.level).toBe(78);
    expect(demands.severity).toBe('elevated');
    // No per-dimension history exists, so direction must be unknown, not invented.
    for (const i of out) expect(i.direction).toBe('unknown');
  });
  it('returns nothing when there is no dimension data', () => {
    expect(buildDimensionIndicators(null)).toEqual([]);
  });
});

describe('sortByAttention: worsening first, then higher strain', () => {
  it('puts a worsening signal ahead of a higher-but-stable one', () => {
    const worseningLow = buildPrimaryIndicators({ overall: 30, mood: 30, climate: 30, overallTrend: t('worsening', 6) })[0];
    const stableHigh = { ...buildPrimaryIndicators({ overall: 80, mood: 80, climate: 80, overallTrend: t('stable', 0) })[0], key: 'x' };
    const sorted = sortByAttention([stableHigh, worseningLow]);
    expect(sorted[0].direction).toBe('worsening');
  });
  it('among same direction, higher current strain comes first', () => {
    const a = buildDimensionIndicators({ demands: 20 })[0];
    const b = buildDimensionIndicators({ control: 90 })[0];
    const sorted = sortByAttention([a, b]);
    expect(sorted[0].level).toBe(90);
  });
});

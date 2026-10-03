import { describe, it, expect } from 'vitest';
import {
  buildCapacityFieldModel, buildScenarioPreview,
  SCENARIO_MODE_INTRO_LINE, SCENARIO_MODE_CTA, SCENARIO_MODE_DISCLAIMER,
} from './capacity-field-engine';

describe('Capacity Field: an honest visualization of real numbers, never fabricated', () => {
  it('is unavailable when capacity has not been checked', () => {
    const model = buildCapacityFieldModel(null, null);
    expect(model.available).toBe(false);
    expect(model.statusLine).toBe('Capacity not checked today');
  });

  it('reflects a comfortable buffer', () => {
    const model = buildCapacityFieldModel(80, 20);
    expect(model.available).toBe(true);
    expect(model.tightness).toBe('comfortable');
    expect(model.bufferPercent).toBe(60);
    expect(model.loadFillPercent).toBe(20);
  });

  it('reflects being over capacity with a negative buffer, clamped not hidden', () => {
    const model = buildCapacityFieldModel(30, 70);
    expect(model.tightness).toBe('over_capacity');
    expect(model.bufferPercent).toBe(-40);
  });

  it('clamps out-of-range inputs rather than rendering a broken field', () => {
    const model = buildCapacityFieldModel(120, -10);
    expect(model.capacityScore).toBe(100);
    expect(model.plannedLoad).toBe(0);
  });
});

describe('Scenario Mode: a non-committal preview against real numbers, never logged', () => {
  it('matches the exact spec-style intro, CTA, and disclaimer', () => {
    expect(SCENARIO_MODE_INTRO_LINE).toMatch(/Nothing here is saved/);
    expect(SCENARIO_MODE_CTA).toBe('Explore a scenario');
    expect(SCENARIO_MODE_DISCLAIMER).toMatch(/isn't logged/);
  });

  it('builds the same honest scenario lines Capacity Gate already uses, plus the visual field', () => {
    const preview = buildScenarioPreview(58, 51);
    expect(preview.accept).toMatch(/tight/);
    expect(preview.move).toBeTruthy();
    expect(preview.decline).toBeTruthy();
    expect(preview.field.available).toBe(true);
    expect(preview.field.tightness).toBe('tight');
  });

  it('stays honest when capacity has not been checked, instead of fabricating a comparison', () => {
    const preview = buildScenarioPreview(null, null);
    expect(preview.accept).toMatch(/guess rather than a real comparison/);
    expect(preview.field.available).toBe(false);
  });
});

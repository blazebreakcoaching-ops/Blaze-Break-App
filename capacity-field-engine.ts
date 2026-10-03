// Capacity Field + Scenario Mode: a pure visual model and preview builder
// on top of numbers that already exist (Energy Delta's real capacity score
// and stressor-derived planned load) - no new scoring, no new data, just an
// honest visualization and a way to explore a hypothetical demand against
// today's real numbers without creating any record. Scenario Mode is
// explicitly a preview, never logged, never a commitment.

import {
  describeBufferAfterAccepting, buildCapacityGateScenarios, CAPACITY_NOT_CHECKED_LABEL,
  BufferTightness, CapacityGateScenarios,
} from './capacity-firewall-engine';

export interface CapacityFieldModel {
  available: boolean;
  capacityScore: number;
  plannedLoad: number;
  bufferPercent: number; // capacityScore - plannedLoad, clamped to [-100, 100]
  loadFillPercent: number; // plannedLoad clamped to [0, 100] - how much of the field is already filled
  tightness: BufferTightness;
  statusLine: string;
}

const TIGHTNESS_STATUS_LINES: Record<BufferTightness, string> = {
  comfortable: 'Comfortable room today.',
  tight: "Tight today - not much room left.",
  very_tight: 'Very tight today.',
  over_capacity: 'Already over capacity today.',
  unknown: CAPACITY_NOT_CHECKED_LABEL,
};

const UNAVAILABLE_FIELD_MODEL: CapacityFieldModel = {
  available: false, capacityScore: 0, plannedLoad: 0, bufferPercent: 0, loadFillPercent: 0,
  tightness: 'unknown', statusLine: CAPACITY_NOT_CHECKED_LABEL,
};

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export const buildCapacityFieldModel = (capacityScore: number | null, plannedLoad: number | null): CapacityFieldModel => {
  if (capacityScore === null || plannedLoad === null) return UNAVAILABLE_FIELD_MODEL;
  const tightness = describeBufferAfterAccepting(capacityScore, plannedLoad);
  return {
    available: true,
    capacityScore: clamp(capacityScore, 0, 100),
    plannedLoad: clamp(plannedLoad, 0, 100),
    bufferPercent: clamp(capacityScore - plannedLoad, -100, 100),
    loadFillPercent: clamp(plannedLoad, 0, 100),
    tightness,
    statusLine: TIGHTNESS_STATUS_LINES[tightness],
  };
};

// ---- Scenario Mode ----------------------------------------------------------

export const SCENARIO_MODE_INTRO_LINE = "Try a demand before deciding. Nothing here is saved - it's just a look at today's real numbers.";
export const SCENARIO_MODE_CTA = 'Explore a scenario';
export const SCENARIO_MODE_DISCLAIMER = "This is just exploring. It isn't logged, and nothing is decided until you run it through the real flow.";

export interface ScenarioPreview extends CapacityGateScenarios {
  field: CapacityFieldModel;
}

export const buildScenarioPreview = (capacityScore: number | null, plannedLoad: number | null): ScenarioPreview => ({
  ...buildCapacityGateScenarios({ capacityScore, plannedLoad }),
  field: buildCapacityFieldModel(capacityScore, plannedLoad),
});

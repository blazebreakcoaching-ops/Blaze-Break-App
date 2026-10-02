import { describe, it, expect } from 'vitest';
import {
  RECIPE_TEMPLATES, SITUATION_ORDER, PRIMARY_SITUATION_ORDER, ADDITIONAL_SITUATION_ORDER,
  SITUATION_LABELS, CAPACITY_ORDER, categoriseDuration, estimateDurationMinutes, RecipeStep,
  ALL_STEPS_BY_ID, getStepsByIds,
} from './recovery-recipes-content';
import { MOVEMENT_ORDER } from './movement-snacks-content';

const ALL_TEMPLATES = Object.values(RECIPE_TEMPLATES);
const CLINICAL_WORDS = ['diagnos', 'treat', 'cure', 'therapy', 'disorder', 'pathol', 'symptom', 'clinical'];

describe('situation taxonomy', () => {
  it('has exactly one template per situation, keyed to itself', () => {
    for (const key of SITUATION_ORDER) {
      expect(RECIPE_TEMPLATES[key].situationKey).toBe(key);
    }
  });

  it('every situation has a human-readable label', () => {
    for (const key of SITUATION_ORDER) {
      expect(SITUATION_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  it('primary and additional situations partition the full order with no overlap or gaps', () => {
    expect(PRIMARY_SITUATION_ORDER.length).toBe(8);
    expect(ADDITIONAL_SITUATION_ORDER.length).toBe(8);
    expect([...PRIMARY_SITUATION_ORDER, ...ADDITIONAL_SITUATION_ORDER]).toEqual(SITUATION_ORDER);
    expect(new Set(SITUATION_ORDER).size).toBe(SITUATION_ORDER.length);
  });
});

describe('recipe templates', () => {
  it('every template is active and has a non-empty title, summary, reason and closing action', () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.active).toBe(true);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.summary.length).toBeGreaterThan(0);
      expect(t.reason.length).toBeGreaterThan(0);
      expect(t.closingAction.length).toBeGreaterThan(0);
    }
  });

  it('coreSteps never exceeds 2 steps - the minimum useful recipe for "almost nothing" capacity (section 6)', () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.coreSteps.length).toBeGreaterThanOrEqual(1);
      expect(t.coreSteps.length).toBeLessThanOrEqual(2);
    }
  });

  it('every template except just_need_reset points to a real fallback template', () => {
    for (const t of ALL_TEMPLATES) {
      if (t.situationKey === 'just_need_reset') {
        expect(t.fallbackTemplateId).toBeUndefined();
      } else {
        expect(t.fallbackTemplateId).toBeTruthy();
        expect(RECIPE_TEMPLATES[t.fallbackTemplateId!]).toBeTruthy();
      }
    }
  });

  it('deliberately withholds a deepStep for situations the brief explicitly warns against over-processing', () => {
    // guilty_resting ("Do not over-reflect"), angry ("Do not diagnose anger"),
    // numb ("Do not force introspection"), over_capacity ("Do not generate
    // extra self-improvement tasks"), difficult_conversation (no lengthy
    // script generation unless the person chooses Nova).
    for (const key of ['guilty_resting', 'angry', 'numb', 'over_capacity', 'difficult_conversation'] as const) {
      expect(RECIPE_TEMPLATES[key].deepStep).toBeUndefined();
    }
  });

  it('numb carries explicit gentleness safety flags and a visible safety note', () => {
    const numb = RECIPE_TEMPLATES.numb;
    expect(numb.safetyFlags).toContain('no_forced_introspection');
    expect(numb.safetyNote).toBeTruthy();
  });

  it('every movement step references a real, active Movement Snack id', () => {
    const allSteps: RecipeStep[] = ALL_TEMPLATES.flatMap((t) => [...t.coreSteps, ...t.expandedSteps, ...(t.deepStep ? [t.deepStep] : [])]);
    for (const step of allSteps) {
      if (step.type === 'movement' && step.movementId) {
        expect(MOVEMENT_ORDER).toContain(step.movementId);
      }
    }
  });

  it('no template copy uses clinical, diagnostic or treatment language (section 31)', () => {
    for (const t of ALL_TEMPLATES) {
      const allText = [
        t.title, t.summary, t.reason, t.closingAction, t.safetyNote || '',
        ...[...t.coreSteps, ...t.expandedSteps, ...(t.deepStep ? [t.deepStep] : [])].flatMap((s) => [
          s.title, s.instruction, s.groundingExcerpt || '', ...(s.reflectionQuestions || []), ...(s.choices || []).map((c) => c.label),
        ]),
      ].join(' ').toLowerCase();
      for (const word of CLINICAL_WORDS) {
        expect(allText.includes(word)).toBe(false);
      }
    }
  });

  it('every structured choice step has at least 2 options', () => {
    const allSteps: RecipeStep[] = ALL_TEMPLATES.flatMap((t) => [...t.coreSteps, ...t.expandedSteps, ...(t.deepStep ? [t.deepStep] : [])]);
    for (const step of allSteps) {
      if (step.choices) expect(step.choices.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('supportedCapacities always covers the full capacity range', () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.supportedCapacities).toEqual(CAPACITY_ORDER);
    }
  });

  it('every template with a grounding step declares supportedLenses', () => {
    for (const t of ALL_TEMPLATES) {
      const hasGroundingStep = [...t.coreSteps, ...t.expandedSteps, ...(t.deepStep ? [t.deepStep] : [])].some((s) => s.type === 'grounding');
      if (hasGroundingStep) expect(t.supportedLenses && t.supportedLenses.length).toBeGreaterThan(0);
    }
  });
});

describe('estimateDurationMinutes / categoriseDuration', () => {
  it('sums step seconds into whole minutes, rounding up to at least 1', () => {
    const steps: RecipeStep[] = [{ id: 'a', type: 'rest', title: '', instruction: '', estimatedSeconds: 20, skippable: true }];
    expect(estimateDurationMinutes(steps)).toBe(1);
  });

  it('classifies a short core-only sequence as quick or short, never deep', () => {
    for (const t of ALL_TEMPLATES) {
      const minutes = estimateDurationMinutes(t.coreSteps);
      const category = categoriseDuration(minutes);
      expect(['quick', 'short']).toContain(category);
    }
  });

  it('classifies minutes beyond every bucket ceiling as deep rather than throwing', () => {
    expect(categoriseDuration(999)).toBe('deep');
  });
});

describe('ALL_STEPS_BY_ID / getStepsByIds (Batch 6 - saved recipe replay)', () => {
  it('every step id across every template is globally unique - a silent collision would resolve "Use as before" to the wrong step', () => {
    const allSteps = ALL_TEMPLATES.flatMap((t) => [...t.coreSteps, ...t.expandedSteps, ...(t.deepStep ? [t.deepStep] : [])]);
    const ids = allSteps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves a real set of stepIds back into their full step objects, in order', () => {
    const steps = getStepsByIds(['shake_it_off', 'action_needed']);
    expect(steps.map((s) => s.id)).toEqual(['shake_it_off', 'action_needed']);
  });

  it('silently drops an id that no longer resolves rather than throwing', () => {
    expect(getStepsByIds(['shake_it_off', 'not_a_real_step_id'])).toEqual([ALL_STEPS_BY_ID.shake_it_off]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getStepsByIds([])).toEqual([]);
  });
});

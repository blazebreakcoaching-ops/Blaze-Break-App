// Invisible Load -> practical assistance choice (Phase 5F Agentic
// Expansion, directive §3).
//
// "Extend the existing Invisible Load interface so that the user can
// select one obligation and choose what help they want... reuse existing
// Action Engine and Recovery Routing capabilities where appropriate."
//
// This file resolves exactly ONE item's chosen help option into a plain
// description of what should happen next - it never acts on anything
// itself (no Firestore write, no navigation, no model call) and never
// invents a score to justify its suggestion. Same single-item discipline
// as nova-invisible-load-take-the-load-bridge.ts: a deferred item is
// refused for every choice except `leave_unchanged`, because "not now"
// must actually mean not now.
//
// WHERE REUSE WAS, AND WASN'T, APPROPRIATE (audited before writing this):
//  - `protect_time` and `defer_or_reprioritise` reuse the real Nova Take
//    the Load proposals (nova-calendar-protection-service.ts /
//    nova-task-deferral-service.ts) via the existing single-item bridge
//    pattern - this file only produces the plain strings those UIs need
//    to prefill, never a new proposal type.
//  - `explore_recovery_tool` does NOT call recovery-routing-engine.ts's
//    `selectRoute`/`compareCandidates`. Those functions require real
//    signal-derived `InterventionCandidate` fields (recency, intensity,
//    etc.) that an Invisible Load item - three words of plain text and a
//    category - has no honest way to supply; fabricating them to force a
//    call would be exactly the kind of invented signal directive §3
//    prohibits ("do not invent psychological scores"). Instead this
//    offers a fixed, honestly-scoped suggestion per category, naming a
//    real existing tool and a plain reason - the same reasoning
//    nhei-recovery-arbitration.ts's own header gives for not calling
//    selectRoute either.
//  - `break_into_steps` reuses nothing from Action Engine. Action
//    Engine's own machinery (Experiments, Moment-of-Truth Plan, Minimum
//    Viable Change) models a personal-change process with its own
//    confirmation states and is a heavier integration than "write down a
//    few steps for one obligation" calls for; this instead reuses
//    nova-invisible-load-contract.ts's own additive `breakdownSteps`
//    field - the user's own words, never generated.

import type { NovaInvisibleLoadItem, NovaInvisibleLoadCategory } from './nova-invisible-load-contract';
import type { NovaStatedPracticalProblem } from './nova-take-the-load-types';

export type NovaInvisibleLoadHelpChoice =
  | 'protect_time'
  | 'defer_or_reprioritise'
  | 'break_into_steps'
  | 'explore_recovery_tool'
  | 'leave_unchanged';

export type NovaInvisibleLoadHelpOutcome =
  | { kind: 'protect_time'; problem: NovaStatedPracticalProblem }
  | { kind: 'defer_or_reprioritise'; taskDescription: string }
  | { kind: 'break_into_steps' }
  | { kind: 'explore_recovery_tool'; suggestedTool: string; reason: string }
  | { kind: 'leave_unchanged' }
  | { kind: 'refused'; reason: 'item_deferred' };

// Fixed, honest, per-category - never derived from a signal this item
// doesn't carry. See this file's own header on why selectRoute isn't
// called here.
const CATEGORY_RECOVERY_TOOL: Record<NovaInvisibleLoadCategory, { tool: string; reason: string }> = {
  commitment: {
    tool: 'Boundary Architect',
    reason: 'A commitment that involves someone else is often easier to renegotiate with a drafted message than to carry silently.',
  },
  obligation: {
    tool: 'Workload Reality Check',
    reason: 'An obligation like this is worth seeing against everything else you are already carrying, not just on its own.',
  },
  practical_friction: {
    tool: 'Micro-Recovery Menu',
    reason: 'Everyday friction like this is often better met with a short recovery action than a plan.',
  },
};

export function resolveInvisibleLoadHelpChoice(
  item: NovaInvisibleLoadItem,
  choice: NovaInvisibleLoadHelpChoice,
  capacityBand: NovaStatedPracticalProblem['capacityBand'],
): NovaInvisibleLoadHelpOutcome {
  if (item.deferred && choice !== 'leave_unchanged') {
    return { kind: 'refused', reason: 'item_deferred' };
  }
  switch (choice) {
    case 'leave_unchanged':
      return { kind: 'leave_unchanged' };
    case 'break_into_steps':
      return { kind: 'break_into_steps' };
    case 'protect_time':
      return { kind: 'protect_time', problem: { description: item.description, capacityBand } };
    case 'defer_or_reprioritise':
      return { kind: 'defer_or_reprioritise', taskDescription: item.description };
    case 'explore_recovery_tool': {
      const { tool, reason } = CATEGORY_RECOVERY_TOOL[item.category];
      return { kind: 'explore_recovery_tool', suggestedTool: tool, reason };
    }
  }
}

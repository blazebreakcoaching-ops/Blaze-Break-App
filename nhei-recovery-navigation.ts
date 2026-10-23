// NHEI PHASE 5 - RECOVERY NAVIGATION PLAN (directive §5: "verify Energy
// Delta navigation")
//
// AUDIT FINDING: recovery-decision-copy.ts's MODULE_TARGET_TAB resolves
// a targetModule to a TAB id only (e.g. 'recover'), and App.tsx's
// 'recover' tab stacks SEVEN different tools in one long scroll
// (WeeklyGoalTracker, EnergyBudgetMatrix, FocusZone, EnergyBudgetTool,
// MicroRecovery, OneLessThing, WorkloadRealityCheck - see App.tsx around
// `activeTab === "recover"`). Landing on that tab alone, with no further
// context, does not reliably put a user looking at the specific tool a
// recommendation was about - confirmed for energy_delta, and the same
// structural gap already existed for one_less_thing/
// workload_reality_check before this phase (not fixed here - out of this
// phase's audited scope, which the directive limited to Energy Delta).
//
// FIX: this file does NOT invent a new route or URL scheme (the
// directive explicitly forbids that). It reuses the EXISTING
// 'navigate_tab' window-event convention (dispatched from ~15 existing
// components already) for the tab switch itself, and adds one small,
// genuinely additive second event - 'nhei_recovery_tool_focus' - carrying
// only a DOM element id for the *same* tab to scroll to once it renders.
// Nothing about the existing 'navigate_tab' event's contract (a bare
// string tab id) changes; every existing dispatcher/listener pair for it
// keeps working exactly as before - confirmed by grep before this change
// (20 existing call sites, all of which pass a bare string).
//
// Pure/testable half of the fix: the anchor map and the function that
// turns a targetModule into a navigation plan. The actual
// DOM-scrolling/listener wiring lives in App.tsx (not independently
// testable - this codebase has no DOM rendering harness; see this
// phase's delivery report for the honest statement of that limit).

import { MODULE_TARGET_TAB } from './recovery-decision-copy';

// Deliberately only the one module this phase actually audited and
// fixed - adding another module here without first confirming its own
// tab similarly stacks multiple tools (and that it has a real DOM id to
// scroll to) would be exactly the kind of unverified destination this
// phase's own directive forbids ("do not invent routes or hardcode
// unsupported destinations").
export const NHEI_MODULE_ANCHOR_ID: Partial<Record<string, string>> = {
  energy_delta: 'energy-delta-tool',
};

export interface NheiRecoveryNavigationPlan {
  // null when the module has no known tab at all (recovery-decision-copy.ts's
  // MODULE_TARGET_TAB has no entry for it) - a caller should not attempt
  // any navigation in that case, never guess a tab.
  tab: string | null;
  // null when the tab itself already shows only this one tool (no
  // disambiguation needed) or when no anchor has been verified for this
  // module yet (see NHEI_MODULE_ANCHOR_ID's own comment).
  anchorId: string | null;
}

export function buildNheiRecoveryNavigationPlan(targetModule: string): NheiRecoveryNavigationPlan {
  const tab = MODULE_TARGET_TAB[targetModule] ?? null;
  const anchorId = NHEI_MODULE_ANCHOR_ID[targetModule] ?? null;
  return { tab, anchorId };
}

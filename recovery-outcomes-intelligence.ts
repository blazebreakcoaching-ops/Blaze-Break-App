// Recovery Outcomes Intelligence - Batch 1 (pure aggregation engine).
//
// Answers one real, previously-unanswerable question: across the whole
// member base, which recovery modules the Routing Engine recommends
// actually help, once a recommendation plays out? The data has existed
// since the Recovery Routing Engine's outcome loop (PR8) - every
// recommendation and its eventual outcome/helpfulness rating is already
// recorded per-user at users/{uid}/recovery_routing_decisions - but
// nothing before this aggregated it across users. This file is the pure
// math; server.ts owns the collectionGroup read and the admin route.
//
// Reuses checkCohortSufficiency (anonymous-aggregation-engine.ts) for the
// per-module minimum-sample gate, but for a different reason than that
// module's own org-level k-anonymity use: at platform scale,
// re-identifying an individual from a module-level helpfulness rate isn't
// the realistic risk the way it is for a 12-person org team. The real
// risk gated here is statistical noise - a module with 3 outcomes
// reporting "100% helped" is misleading, not identifying - so the
// threshold is framed and tuned as a reliability floor, not a privacy
// control.

import { checkCohortSufficiency } from './anonymous-aggregation-engine';

export type RoutingOutcome = 'declined' | 'completed' | 'abandoned' | null | undefined;
export type RoutingHelpfulness = 'better' | 'same' | 'not_really' | 'not_sure' | null | undefined;

export interface RoutingDecisionRecord {
  selectedModule: string | null;
  outcome?: RoutingOutcome;
  helpfulness?: RoutingHelpfulness;
}

export interface ModuleOutcomeSummary {
  module: string;
  recommended: number;
  resolved: number; // recommendations with any recorded outcome (declined/completed/abandoned)
  completed: number;
  declined: number;
  abandoned: number;
  completionRate: number | null; // completed / resolved
  helpfulness: { better: number; same: number; not_really: number; not_sure: number };
  // better / (better + same + not_really) - not_sure is excluded from the
  // denominator since it isn't a signal either way, not treated as neutral.
  netPositiveRate: number | null;
  sufficientSample: boolean;
  sampleThreshold: number;
}

export const DEFAULT_OUTCOME_SAMPLE_THRESHOLD = 20;

export function summarizeModuleOutcomes(
  decisions: RoutingDecisionRecord[],
  sampleThreshold: number = DEFAULT_OUTCOME_SAMPLE_THRESHOLD,
): ModuleOutcomeSummary[] {
  const byModule = new Map<string, RoutingDecisionRecord[]>();
  for (const d of decisions) {
    if (!d.selectedModule) continue;
    const list = byModule.get(d.selectedModule) ?? [];
    list.push(d);
    byModule.set(d.selectedModule, list);
  }

  const summaries: ModuleOutcomeSummary[] = [];
  for (const [module, list] of byModule.entries()) {
    const recommended = list.length;
    const declined = list.filter((d) => d.outcome === 'declined').length;
    const completed = list.filter((d) => d.outcome === 'completed').length;
    const abandoned = list.filter((d) => d.outcome === 'abandoned').length;
    const resolved = declined + completed + abandoned;

    const helpfulness = { better: 0, same: 0, not_really: 0, not_sure: 0 };
    for (const d of list) {
      if (d.outcome === 'completed' && d.helpfulness && d.helpfulness in helpfulness) {
        helpfulness[d.helpfulness as keyof typeof helpfulness] += 1;
      }
    }
    const netPositiveDenominator = helpfulness.better + helpfulness.same + helpfulness.not_really;

    const sufficiency = checkCohortSufficiency(resolved, sampleThreshold);

    summaries.push({
      module,
      recommended,
      resolved,
      completed,
      declined,
      abandoned,
      completionRate: resolved > 0 ? completed / resolved : null,
      helpfulness,
      netPositiveRate: netPositiveDenominator > 0 ? helpfulness.better / netPositiveDenominator : null,
      sufficientSample: sufficiency.sufficient,
      sampleThreshold,
    });
  }

  // Most-recommended module first - that's what a reader scanning the
  // list cares about seeing immediately, not alphabetical order.
  return summaries.sort((a, b) => b.recommended - a.recommended);
}

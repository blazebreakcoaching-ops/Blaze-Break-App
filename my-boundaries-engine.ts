// My Boundaries: a non-gamified reflective view built entirely from real
// stored history across Capacity Firewall decisions, Boundary Autopilot
// outcomes, and saved Boundary Architect scripts - never a score, streak,
// or badge. Every section here either shows real records back, or reuses
// the same minimum-sample/consistency-gated pattern detection the Memory
// Graph and Evidence Base already established, rather than inventing a
// second, looser standard for "pattern" just because the framing changed.

import { FirewallChoice, ConditionalYesLever, CONDITIONAL_YES_LEVER_LABELS, FIREWALL_CHOICE_LABELS } from './capacity-firewall-engine';
import {
  BoundaryOutcome, FearedOutcome, RequestSourceType,
  detectSourcePattern, BoundaryMemoryEntry,
  buildEvidenceBaseResult, EvidencePair, EvidenceBaseResult,
  REQUEST_SOURCE_ORDER, REQUEST_SOURCE_LABELS,
} from './boundary-outcome-engine';

// ---- Boundaries I've Chosen -----------------------------------------------

export interface ChosenBoundaryInput {
  demandDescription: string;
  choice: FirewallChoice | null;
  createdAt: string;
}

export interface ChosenBoundaryEntry {
  demandDescription: string;
  choiceLabel: string;
  createdAt: string;
}

const CHOSEN_BOUNDARIES_LIMIT = 5;

export const summarizeBoundariesChosen = (decisions: ChosenBoundaryInput[]): ChosenBoundaryEntry[] =>
  decisions
    .filter((d): d is ChosenBoundaryInput & { choice: FirewallChoice } => d.choice !== null)
    .slice(0, CHOSEN_BOUNDARIES_LIMIT)
    .map((d) => ({
      demandDescription: d.demandDescription,
      choiceLabel: FIREWALL_CHOICE_LABELS[d.choice],
      createdAt: d.createdAt,
    }));

// ---- Practising ------------------------------------------------------------

export interface DraftScriptInput {
  title: string;
  status: 'draft' | 'saved';
  createdAt: string;
}

const PRACTISING_LIMIT = 5;

export const summarizeBoundariesPractising = (scripts: DraftScriptInput[]): DraftScriptInput[] =>
  scripts.filter((s) => s.status === 'draft').slice(0, PRACTISING_LIMIT);

// ---- What Usually Tests Them -----------------------------------------------

export interface SourcePatternSummary {
  source: RequestSourceType;
  sourceLabel: string;
  pattern: string;
}

export const summarizeWhatUsuallyTestsThem = (entries: BoundaryMemoryEntry[]): SourcePatternSummary[] => {
  const results: SourcePatternSummary[] = [];
  for (const source of REQUEST_SOURCE_ORDER) {
    const pattern = detectSourcePattern(entries, source);
    if (pattern) results.push({ source, sourceLabel: REQUEST_SOURCE_LABELS[source], pattern });
  }
  return results;
};

// ---- What Has Worked --------------------------------------------------------

export interface WorkedOutcomeInput {
  fearedOutcome: FearedOutcome | null;
  outcome: BoundaryOutcome | null;
}

export const summarizeWhatHasWorked = (outcomes: WorkedOutcomeInput[]): EvidenceBaseResult => {
  const pairs: EvidencePair[] = outcomes
    .filter((o): o is { fearedOutcome: FearedOutcome; outcome: BoundaryOutcome } => o.fearedOutcome !== null && o.outcome !== null)
    .map((o) => ({ feared: o.fearedOutcome, outcome: o.outcome }));
  return buildEvidenceBaseResult(pairs);
};

// ---- Capacity I've Protected -------------------------------------------------

export interface CapacityProtectedInput {
  capacityProtectedApplied: boolean;
}

export const countCapacityProtected = (outcomes: CapacityProtectedInput[]): number =>
  outcomes.filter((o) => o.capacityProtectedApplied).length;

// ---- Experiments I'm Trying --------------------------------------------------
// Conditional Yes decisions have no outcome field in Capacity Firewall itself
// (that loop isn't tracked there), so these are honestly framed as
// unresolved experiments rather than confirmed wins.

export interface ExperimentInput {
  demandDescription: string;
  choice: FirewallChoice | null;
  conditionalYesLever: ConditionalYesLever | null;
  conditionalYesMessage: string | null;
  createdAt: string;
}

export interface ExperimentEntry {
  demandDescription: string;
  leverLabel: string | null;
  message: string | null;
  createdAt: string;
}

const EXPERIMENTS_LIMIT = 5;

export const summarizeExperimentsTrying = (decisions: ExperimentInput[]): ExperimentEntry[] =>
  decisions
    .filter((d) => d.choice === 'conditional_yes')
    .slice(0, EXPERIMENTS_LIMIT)
    .map((d) => ({
      demandDescription: d.demandDescription,
      leverLabel: d.conditionalYesLever ? CONDITIONAL_YES_LEVER_LABELS[d.conditionalYesLever] : null,
      message: d.conditionalYesMessage,
      createdAt: d.createdAt,
    }));

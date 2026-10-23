// NHEI PHASE 4B/5 - RECOVERY RECOMMENDATION ARBITRATION
//
// Phase 4 built buildNheiRecoverySuggestions, which produces zero or more
// independently-evaluated NheiRecoverySuggestion candidates but never
// picks one - "the choice between multiple suggestions is left to
// whatever future consumer reads NheiRecoveryBridgeResult" (Phase 4's own
// header comment). This file is that consumer: a deterministic
// arbitration layer that selects at most one suggestion as the default
// recommendation, keeps the rest as inspectable alternatives, and
// explains itself either way.
//
// PHASE 5 FIX (directive §4, "reconcile alternatives and capacity"):
// Phase 4B's first version deduplicated by `routeType`, which was wrong -
// two suggestions sharing a broad RouteType (e.g. reset_studio and
// anxiety_reset, both STABILISE) are NOT the same recommendation, they
// are materially different real tools that happen to serve a similar
// purpose. Treating them as duplicates silently erased a genuine
// alternative. Deduplication now keys on `targetModule` - a genuine
// duplicate is the same exact tool suggested more than once (which none
// of the bridge's six rules can currently produce, since each has a
// fixed, distinct targetModule, but a future rule addition could).
// Suggestions sharing only a routeType are both kept, one as `selected`
// and the other as a real `alternatives` entry - never merged away.
//
// PHASE 5 FIX (same directive item): capacity-unsuitable suggestions are
// now returned in their own `unsuitableForCapacity` field, never mixed
// into `alternatives` - "capacity-unsuitable suggestions must not appear
// as ordinary default or equivalent alternatives." A consumer that wants
// to show them (e.g. "not a fit right now, but here's what else exists")
// can do so deliberately, with its own distinct visual treatment; a
// consumer that just renders `alternatives` never shows one by accident.
//
// WHY THIS DOESN'T CALL selectRoute/compareCandidates
// (recovery-routing-engine.ts): those functions arbitrate between
// InterventionCandidate objects, which carry fields this file has no
// honest way to fill in from an NheiRecoverySuggestion - urgency,
// recentlyUsed, userPreferenceMatch, prerequisitesMet,
// eligibleForPrivacyZone, requiresConnector, requiresHumanContact. None
// of those are derivable from NHEI's evidence-summary input without
// inventing a signal NHEI never actually observed, which is exactly the
// kind of unsupported inference this phase forbids ("avoid creating
// psychological scoring or unsupported causal inference" extends to
// inventing urgency/preference signals too). So this file builds its own
// small, separate arbitration specific to NHEI's own suggestion shape,
// using only fields that already exist on it (interpretationKind,
// capacitySuitability, matchesStatedGoal) - and it still reuses the one
// piece of Recovery Routing machinery that genuinely applies:
// isKnownRoutingModule, plus the bridge's own matchingExistingCandidateId
// cross-reference, so a future consumer can see when NHEI's pick and
// Recovery Routing's independent pick agree.
//
// OFFLINE AT THIS PHASE: not imported by server.ts or any live route,
// same as nhei-recovery-bridge.ts.

import { isKnownRoutingModule } from './recovery-signal-candidates';
import type { NheiRecoverySuggestion } from './nhei-recovery-bridge-types';

export type NheiRecoveryAbstentionReason =
  | 'no_candidates'
  | 'all_targets_unavailable'
  | 'all_unsuitable_for_capacity';

export interface NheiRecoveryArbitrationInput {
  suggestions: NheiRecoverySuggestion[];
  // Known (isKnownRoutingModule === true) modules that are currently
  // unavailable - e.g. paused for maintenance. Always caller-supplied,
  // never derived or inferred here; this file invents no new
  // governance/feature-flag mechanism of its own. Directive §1/§6:
  // "Handle unsupported or unavailable recovery modules."
  unavailableModules?: ReadonlySet<string> | string[];
}

export interface NheiRecoveryArbitrationResult {
  // At most one. Never capacitySuitability === 'unsuitable' - directive:
  // "Never select a capacity-unsuitable action as the default
  // recommendation."
  selected: NheiRecoverySuggestion | null;
  // Other genuinely distinct, capacity-suitable-or-unknown options -
  // real choices the user could act on, always inspectable, never acted
  // on automatically.
  alternatives: NheiRecoverySuggestion[];
  // Real suggestions that exist but do not fit current capacity - kept
  // structurally separate from `alternatives` so a consumer can never
  // render one as if it were an ordinary, equivalent choice by accident.
  unsuitableForCapacity: NheiRecoverySuggestion[];
  // Suggestions that targeted the exact SAME targetModule as another
  // suggestion and lost that reconciliation - kept here, never silently
  // dropped. Two suggestions merely sharing a routeType are NOT
  // reconciled - see this file's header comment.
  dedupedAway: NheiRecoverySuggestion[];
  abstentionReason: NheiRecoveryAbstentionReason | null;
  // Plain language, present whenever `selected` is non-null OR
  // abstentionReason is non-null - arbitration never leaves its own
  // outcome unexplained.
  selectionReason: string | null;
}

// Fixed, non-numeric ranking order for interpretationKind - 'confirmed'
// outranks 'tentative' outranks 'educational'. This is an ORDERING, not
// a score: nothing here adds, weights, or combines values into a
// number, so there is no invented psychological scale.
const INTERPRETATION_KIND_RANK: Record<NheiRecoverySuggestion['interpretationKind'], number> = {
  confirmed: 0,
  tentative: 1,
  educational: 2,
};

function compareSuggestions(a: NheiRecoverySuggestion, b: NheiRecoverySuggestion): number {
  const kindDiff = INTERPRETATION_KIND_RANK[a.interpretationKind] - INTERPRETATION_KIND_RANK[b.interpretationKind];
  if (kindDiff !== 0) return kindDiff;
  if (a.matchesStatedGoal !== b.matchesStatedGoal) return a.matchesStatedGoal ? -1 : 1;
  // capacitySuitability can only be 'suitable' or 'unknown' at the call
  // sites below - both exclude 'unsuitable' before ranking ever runs.
  if (a.capacitySuitability !== b.capacitySuitability) return a.capacitySuitability === 'suitable' ? -1 : 1;
  return 0; // stable - keeps the bridge's own deterministic rule order
}

// The one entry point. Deterministic and side-effect-free - no I/O, no
// randomness, no clock read. Never mutates its input arrays.
export function arbitrateNheiRecoverySuggestions(input: NheiRecoveryArbitrationInput): NheiRecoveryArbitrationResult {
  if (input.suggestions.length === 0) {
    return {
      selected: null, alternatives: [], unsuitableForCapacity: [], dedupedAway: [],
      abstentionReason: 'no_candidates', selectionReason: 'No candidate suggestions were produced for this evidence.',
    };
  }

  const unavailable = new Set(input.unavailableModules ?? []);
  // Defensive re-verification, even though the bridge already checks this
  // for every suggestion it builds - arbitration never trusts an upstream
  // guarantee it can cheaply re-check itself.
  const available = input.suggestions.filter((s) => isKnownRoutingModule(s.targetModule) && !unavailable.has(s.targetModule));
  if (available.length === 0) {
    return {
      selected: null, alternatives: [], unsuitableForCapacity: [], dedupedAway: [],
      abstentionReason: 'all_targets_unavailable',
      selectionReason: 'Every suggested capability is currently unavailable or unsupported.',
    };
  }

  // Deduplicate/reconcile TRUE duplicates only - same exact targetModule
  // suggested more than once. Two different modules sharing a routeType
  // are never merged (Phase 5 fix - see header comment).
  const byModule = new Map<string, NheiRecoverySuggestion[]>();
  for (const s of available) {
    const group = byModule.get(s.targetModule) ?? [];
    group.push(s);
    byModule.set(s.targetModule, group);
  }
  const distinctSuggestions: NheiRecoverySuggestion[] = [];
  const dedupedAway: NheiRecoverySuggestion[] = [];
  for (const group of byModule.values()) {
    const sorted = [...group].sort(compareSuggestions);
    distinctSuggestions.push(sorted[0]);
    dedupedAway.push(...sorted.slice(1));
  }

  // Never select a capacity-unsuitable action as the default, and never
  // let one masquerade as an ordinary alternative - kept in its own
  // field entirely (Phase 5 fix).
  const suitableOrUnknown = distinctSuggestions.filter((s) => s.capacitySuitability !== 'unsuitable');
  const unsuitableForCapacity = distinctSuggestions.filter((s) => s.capacitySuitability === 'unsuitable');

  if (suitableOrUnknown.length === 0) {
    // Every real, distinct option is capacity-unsuitable - abstain from
    // a default, but still surface them (in their own field, never as
    // ordinary alternatives) so the user isn't handed silence when real
    // (if currently ill-fitting) options exist.
    return {
      selected: null, alternatives: [], unsuitableForCapacity, dedupedAway,
      abstentionReason: 'all_unsuitable_for_capacity',
      selectionReason: 'The only matching suggestions do not fit your currently available capacity.',
    };
  }

  const ranked = [...suitableOrUnknown].sort(compareSuggestions);
  const selected = ranked[0];
  const alternatives = ranked.slice(1);

  const reasonParts: string[] = [];
  if (selected.interpretationKind === 'confirmed') reasonParts.push('builds on evidence you’ve confirmed');
  if (selected.matchesStatedGoal) reasonParts.push('matches what you said you wanted');
  if (selected.capacitySuitability === 'suitable') reasonParts.push('fits your currently available capacity');
  const selectionReason = reasonParts.length > 0
    ? `Selected because it ${reasonParts.join(' and ')}.`
    : 'Selected as the strongest available suggestion for this situation.';

  return { selected, alternatives, unsuitableForCapacity, dedupedAway, abstentionReason: null, selectionReason };
}

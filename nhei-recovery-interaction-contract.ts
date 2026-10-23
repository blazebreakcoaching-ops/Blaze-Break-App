// NHEI PHASE 4B - RECOVERY SUGGESTION INTERACTION CONTRACT (OFFLINE)
//
// Real, tested state transitions for how a user can interact with the
// output of arbitrateNheiRecoverySuggestions - accept, dismiss, ask for
// an explanation, look at an alternative, flag a wrong tag, or decline
// everything for this interaction. Directive §4: "these must be real,
// tested operations or state transitions, not just documentation or
// absent fields."
//
// STRUCTURAL GUARANTEES, not just comments:
//   - No persistence as psychological evidence: this file imports
//     nothing from nhei-persistence-service.ts (or any Firestore client)
//     at all - there is no code path here that could write anything,
//     to any collection, ever. A correction is recorded only as a
//     session-scoped suggestion id in this reducer's own return value;
//     nothing propagates it into an NheiEvidenceRecord.
//   - No interpretation of rejection as resistance/noncompliance/a
//     trait: dismissedSuggestionIds and declinedAll are plain,
//     unscored, session-scoped flags - nothing here counts occurrences
//     across sessions, assigns a number, or feeds any other NHEI engine.
//   - No automatic navigation, message sending, calendar modification,
//     or Guardian communication: this file imports nothing from
//     guardian-alert.ts, any calendar module, any messaging code, or
//     React/window - it is a pure reducer over plain data, with no
//     import capable of producing a side effect even by accident.
//
// OFFLINE AT THIS PHASE: not imported by server.ts, any route, or any
// .tsx component - a future UI layer would be this file's first real
// caller, gated on its own approval like everything else in Phase 4/4B.

export type NheiRecoveryInteractionActionType =
  | 'accept'
  | 'dismiss'
  | 'explain'
  | 'view_alternative'
  | 'correct_interpretation'
  | 'decline_all';

export type NheiRecoveryInteractionAction =
  | { type: 'accept'; suggestionId: string }
  | { type: 'dismiss'; suggestionId: string }
  | { type: 'explain'; suggestionId: string }
  | { type: 'view_alternative'; suggestionId: string }
  // `note` is never stored beyond being echoed back in the return value
  // for a future UI to display - it is NOT written into
  // correctedSuggestionIds or anywhere else as free text, matching
  // NHEI's "ids only, never raw content" discipline throughout.
  | { type: 'correct_interpretation'; suggestionId: string; note?: string }
  | { type: 'decline_all' };

export interface NheiRecoveryInteractionState {
  // Fixed for the life of this interaction, set once by
  // initNheiRecoveryInteractionState - the only ids any action below may
  // reference.
  availableSuggestionIds: string[];
  selectedSuggestionId: string | null;
  viewedAlternativeId: string | null;
  dismissedSuggestionIds: string[];
  explainedSuggestionIds: string[];
  correctedSuggestionIds: string[];
  declinedAll: boolean;
  // Non-null only immediately after an action referencing an id outside
  // availableSuggestionIds - the action is a no-op (state otherwise
  // unchanged), never a thrown error and never silently accepted.
  lastActionRejectedReason: 'unknown_suggestion_id' | null;
}

export interface NheiRecoveryArbitrationLike {
  selected: { suggestionId: string } | null;
  alternatives: { suggestionId: string }[];
}

export function initNheiRecoveryInteractionState(arbitration: NheiRecoveryArbitrationLike): NheiRecoveryInteractionState {
  const ids = [
    ...(arbitration.selected ? [arbitration.selected.suggestionId] : []),
    ...arbitration.alternatives.map((a) => a.suggestionId),
  ];
  return {
    availableSuggestionIds: ids,
    selectedSuggestionId: arbitration.selected?.suggestionId ?? null,
    viewedAlternativeId: null,
    dismissedSuggestionIds: [],
    explainedSuggestionIds: [],
    correctedSuggestionIds: [],
    declinedAll: false,
    lastActionRejectedReason: null,
  };
}

function addUnique(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

// The one entry point - a pure reducer, always returning a NEW state
// object, never mutating `state`. Deterministic: the same (state,
// action) pair always produces the same result.
export function applyNheiRecoveryInteraction(
  state: NheiRecoveryInteractionState,
  action: NheiRecoveryInteractionAction,
): NheiRecoveryInteractionState {
  if (action.type === 'decline_all') {
    // A real, proportionate "no" across the board for this interaction -
    // never treated as more significant than a single dismiss, never
    // scored, never fed anywhere else.
    return { ...state, declinedAll: true, selectedSuggestionId: null, lastActionRejectedReason: null };
  }

  if (!state.availableSuggestionIds.includes(action.suggestionId)) {
    return { ...state, lastActionRejectedReason: 'unknown_suggestion_id' };
  }

  switch (action.type) {
    case 'accept':
      // Accepting an alternative switches the selection to it - the user
      // always has the final say over arbitration's own default pick.
      return { ...state, selectedSuggestionId: action.suggestionId, lastActionRejectedReason: null };

    case 'dismiss': {
      const dismissedSuggestionIds = addUnique(state.dismissedSuggestionIds, action.suggestionId);
      // A dismissed suggestion can never remain the active selection.
      const selectedSuggestionId = state.selectedSuggestionId === action.suggestionId ? null : state.selectedSuggestionId;
      return { ...state, dismissedSuggestionIds, selectedSuggestionId, lastActionRejectedReason: null };
    }

    case 'explain':
      return { ...state, explainedSuggestionIds: addUnique(state.explainedSuggestionIds, action.suggestionId), lastActionRejectedReason: null };

    case 'view_alternative':
      // Browsing only - never changes which suggestion is selected.
      return { ...state, viewedAlternativeId: action.suggestionId, lastActionRejectedReason: null };

    case 'correct_interpretation':
      return { ...state, correctedSuggestionIds: addUnique(state.correctedSuggestionIds, action.suggestionId), lastActionRejectedReason: null };

    default:
      return state;
  }
}

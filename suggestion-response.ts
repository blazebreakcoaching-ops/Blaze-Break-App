// "You Said -> We Changed" (Work Design Pulse PR10) - the closed trust
// loop linking Anonymous Team Voice (anonymous_suggestions) to a real,
// honest outcome. Pure logic only (no Firestore, no React); server.ts
// owns reading/writing the suggestion's own linkedInterventionId/
// responseNote fields and looking up the linked intervention's current
// status/outcomeRating - this file only derives what to show from those
// real inputs.
//
// The honest "we haven't changed this yet" path is a first-class, valid
// response - an admin can say exactly that instead of having to invent an
// intervention just to close the loop, and this module never upgrades
// that into something that looks more decisive than it is.

export type SuggestionResponseType = 'changed' | 'tried_no_clear_benefit' | 'in_progress' | 'not_yet';

export interface SuggestionResponse {
  type: SuggestionResponseType;
  message: string;
}

export interface DeriveSuggestionResponseInput {
  linkedInterventionId: string | null;
  // The linked intervention's own real fields - server.ts looks these up
  // live, never cached, so a response always reflects the intervention's
  // CURRENT state, not whatever it was when the link was made.
  interventionStatus: string | null;
  outcomeRating: 'useful' | 'partly_useful' | 'no_clear_difference' | 'created_another_problem' | 'stopped_early' | null;
  // An admin's own honest note when nothing has been done yet - the only
  // field set when there's no linkedInterventionId at all.
  note: string | null;
}

const POSITIVE_OUTCOMES = new Set(['useful', 'partly_useful']);

// Returns null when nobody has reviewed this suggestion at all (no link,
// no note) - the UI shows nothing extra, rather than an invented "under
// review" status this module has no real basis for claiming.
export const deriveSuggestionResponse = (input: DeriveSuggestionResponseInput): SuggestionResponse | null => {
  if (!input.linkedInterventionId) {
    if (!input.note) return null;
    return { type: 'not_yet', message: input.note };
  }
  if (!input.outcomeRating) {
    return { type: 'in_progress', message: "We're currently trying something in response to this - we'll share what happened once we know." };
  }
  if (POSITIVE_OUTCOMES.has(input.outcomeRating)) {
    return { type: 'changed', message: "We changed this in response, and it genuinely helped." };
  }
  return { type: 'tried_no_clear_benefit', message: "We tried something in response to this, but it didn't clearly help - we're not calling this resolved." };
};

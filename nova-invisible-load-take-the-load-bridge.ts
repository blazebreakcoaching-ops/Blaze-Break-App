// Invisible Load -> Take the Load bridge (Phase 5C, directive §4).
//
// "Connect suitable user-confirmed practical context to the Take the
// Load proposal engine. Do not turn every obligation into a task
// automatically." This file has exactly one function, and it takes a
// single item, not a context's whole list - there is no "build a
// problem for every item" helper here, by design, so a UI can never
// wire this up in a way that acts on an obligation the user hasn't
// individually chosen to act on right now. A deferred item is refused
// outright (see below) - "not now" must actually mean not now.
//
// This produces only the existing, real NovaStatedPracticalProblem type
// (nova-take-the-load-types.ts) - no new type, no score, no persistence.
// Zero import of anything under the `nhei-` prefix.

import type { NovaInvisibleLoadItem } from './nova-invisible-load-contract';
import type { NovaStatedPracticalProblem } from './nova-take-the-load-types';

export type NovaInvisibleLoadBridgeRefusalReason = 'item_deferred';

export type NovaInvisibleLoadBridgeResult =
  | { ok: true; problem: NovaStatedPracticalProblem }
  | { ok: false; reason: NovaInvisibleLoadBridgeRefusalReason };

/**
 * Builds a Take the Load problem statement from exactly one invisible-load
 * item the user has explicitly asked for help with. Refuses a deferred
 * item - the caller must undefer it first (an equally explicit action)
 * before this will ever produce a problem for it.
 */
export function buildTakeTheLoadProblemFromInvisibleLoadItem(
  item: NovaInvisibleLoadItem,
  capacityBand: NovaStatedPracticalProblem['capacityBand'],
): NovaInvisibleLoadBridgeResult {
  if (item.deferred) {
    return { ok: false, reason: 'item_deferred' };
  }
  return {
    ok: true,
    problem: {
      description: item.description,
      capacityBand,
    },
  };
}

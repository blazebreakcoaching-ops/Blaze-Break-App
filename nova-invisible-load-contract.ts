// Invisible Load representation (Phase 5B, directive §5).
//
// Audit before writing this (recorded in the Phase 5B delivery report):
// a repo-wide search found no existing "Invisible Load" system - only a
// single colloquial phrase in RecoveryPlan.tsx's feedback copy
// ("naming the invisible load, not carrying it silently"), which is not
// a data model. This file is new, from scratch.
//
// Covers user-reported obligations, competing commitments, and sources
// of practical friction - plain text, user-categorised, never a hidden
// score. There is no "load score", "burden index", or any derived
// numeric rating anywhere in this file - that would be exactly the
// "hidden personal rating" the directive prohibits. Zero import
// statements (verified by this file's own test, same discipline as
// nhei-before-words-contract.ts and nhei-agentic-action-contract.ts) -
// no persistence, no model call. Every item preserves uncertainty
// (`userCertain`), can be corrected additively, and can be withdrawn
// (`removeInvisibleLoadItem`) - this is opt-out, not just non-mandatory.

export type NovaInvisibleLoadCategory = 'commitment' | 'obligation' | 'practical_friction';

export interface NovaInvisibleLoadItem {
  readonly id: string;
  /** The user's own words. Never rewritten, summarised, or reinterpreted here. */
  readonly description: string;
  readonly category: NovaInvisibleLoadCategory;
  /** Always 'user_reported' - this file has no other source of an item. */
  readonly source: 'user_reported';
  /** Whether the user is sure this belongs here at all - preserved, never resolved away. */
  userCertain: boolean;
  corrections: string[];
  // Phase 5C (directive §4, "allow users to... defer"): a deferred item
  // stays recorded (unlike remove, which deletes it) but is excluded from
  // buildTakeTheLoadProblemsFromInvisibleLoad below - "I don't want to
  // act on this right now" is a real, distinct choice from "this isn't
  // true" (correct) or "take this off the list" (remove).
  deferred: boolean;
}

export interface NovaInvisibleLoadContext {
  items: NovaInvisibleLoadItem[];
  /** True once the user has explicitly chosen not to share any of this - distinct from an empty list, which just means nothing was added yet. */
  optedOut: boolean;
}

let itemCounter = 0;
function nextItemId(): string {
  itemCounter += 1;
  return `invisible_load_item_${itemCounter}`;
}

export function initNovaInvisibleLoadContext(): NovaInvisibleLoadContext {
  return { items: [], optedOut: false };
}

export function addInvisibleLoadItem(
  context: NovaInvisibleLoadContext,
  description: string,
  category: NovaInvisibleLoadCategory,
  userCertain: boolean,
): NovaInvisibleLoadContext {
  if (context.optedOut) return context; // opting out means nothing further is added, not silently re-enabled
  const item: NovaInvisibleLoadItem = {
    id: nextItemId(),
    description,
    category,
    source: 'user_reported',
    userCertain,
    corrections: [],
    deferred: false,
  };
  return { ...context, items: [...context.items, item] };
}

/** "Not now" - stays in the list, just excluded from any Take the Load problem built from this context. */
export function deferInvisibleLoadItem(context: NovaInvisibleLoadContext, itemId: string): NovaInvisibleLoadContext {
  return { ...context, items: context.items.map((item) => (item.id === itemId ? { ...item, deferred: true } : item)) };
}

/** Reverses a defer - an explicit, equally-available "actually, now" action, never automatic. */
export function undeferInvisibleLoadItem(context: NovaInvisibleLoadContext, itemId: string): NovaInvisibleLoadContext {
  return { ...context, items: context.items.map((item) => (item.id === itemId ? { ...item, deferred: false } : item)) };
}

/** Additive only - never overwrites the original description, matching nhei-before-words-contract.ts's own discipline. */
export function correctInvisibleLoadItem(context: NovaInvisibleLoadContext, itemId: string, correction: string): NovaInvisibleLoadContext {
  return {
    ...context,
    items: context.items.map((item) => (item.id === itemId ? { ...item, corrections: [...item.corrections, correction] } : item)),
  };
}

export function removeInvisibleLoadItem(context: NovaInvisibleLoadContext, itemId: string): NovaInvisibleLoadContext {
  return { ...context, items: context.items.filter((item) => item.id !== itemId) };
}

/** Explicit opt-out - clears any items already added, since "opted out" must mean nothing is retained, not just hidden. */
export function optOutOfInvisibleLoad(_context: NovaInvisibleLoadContext): NovaInvisibleLoadContext {
  return { items: [], optedOut: true };
}

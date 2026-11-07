// Nova practical-assistance outcome feedback (Phase 5F Agentic Expansion,
// directive §7).
//
// Deliberately NOT the same shape as recovery-outcomes-intelligence.ts's
// `'declined' | 'completed' | 'abandoned'` + helpfulness-rating model
// (`'better' | 'same' | 'not_really' | 'not_sure'`, used for recovery
// *module* recommendations at `users/{uid}/recovery_routing_decisions`).
// The directive asks for a simpler, four-option shape specific to
// practical task assistance ("this helped" / "I changed the plan" / "I
// didn't use it" / "I need another approach") — reusing the recovery
// model's exact enum here would misrepresent what's actually being asked,
// since "I changed the plan" and "I need another approach" have no
// equivalent in the recovery model at all. This file is new, but keeps
// that model's discipline:
//  - No causal claim. Recording `helped` means the user tapped "this
//    helped," nothing more — never translated into a wellbeing score, a
//    burnout-archetype signal, or any other inference.
//  - No inferred improvement from approval or completion alone. A
//    confirmed/executed proposal with no feedback recorded is simply
//    unrated, never silently counted as `helped`.
//  - Declining is not resistance. `not_used` and `need_another_approach`
//    are recorded as plain facts about what happened, never surfaced
//    anywhere as a negative trait of the user.
//
// Workflow-scoped and additive by design (`NovaTaskAssistanceWorkflow`):
// `task_deferral` was the first workflow wired to a route (directive §7
// specifically asked to connect "the new offline task-assistance
// workflow" — Task Deferral — to this contract). Phase 5G, directive §8
// ("verify the user can distinguish... an outcome confirmed by the
// user", across the whole journey, not just one workflow) adds
// `calendar_protection` as the second — POST
// /api/nova/calendar-protection/:proposalId/outcome, wired only after a
// REAL `confirmed` state (see NovaTakeTheLoad.tsx's own STATE_LABEL -
// unlike Task Deferral's `confirmed`, which only ever means a simulation
// completed). The type remains a union so a future practical-assistance
// workflow can reuse this file the same way, without a breaking change.

export type NovaTaskAssistanceWorkflow = 'task_deferral' | 'calendar_protection';

export type NovaTaskAssistanceOutcome = 'helped' | 'changed_plan' | 'not_used' | 'need_another_approach';

export interface NovaTaskAssistanceOutcomeRecord {
  readonly workflow: NovaTaskAssistanceWorkflow;
  readonly itemId: string;
  readonly outcome: NovaTaskAssistanceOutcome;
  readonly recordedAt: string;
}

export interface FirestoreDocRefLike {
  set(data: any, options?: { merge?: boolean }): Promise<any>;
}

export interface FirestoreLike {
  collection(path: string): { doc(id: string): FirestoreDocRefLike };
}

/**
 * One record per (workflow, itemId) — a user re-submitting feedback for
 * the same proposal replaces their own prior answer rather than
 * accumulating duplicate rows, the same "latest answer wins" discipline
 * recovery-outcomes-intelligence.ts's own outcome writes use.
 */
export async function recordTaskAssistanceOutcome(
  db: FirestoreLike,
  uid: string,
  input: { workflow: NovaTaskAssistanceWorkflow; itemId: string; outcome: NovaTaskAssistanceOutcome },
): Promise<NovaTaskAssistanceOutcomeRecord> {
  const record: NovaTaskAssistanceOutcomeRecord = { ...input, recordedAt: new Date().toISOString() };
  await db.collection(`users/${uid}/task_assistance_outcomes`).doc(`${input.workflow}_${input.itemId}`).set(record);
  return record;
}

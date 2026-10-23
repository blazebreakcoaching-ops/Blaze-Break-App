// NHEI PHASE 3C CHECKPOINT 3 SECTION 3 - EDUCATIONAL CONTENT REVIEW SUPPORT
//
// Audit finding: nhei-knowledge-service.ts's
// approveKnowledgeEntryAsVerifiedReviewer/rejectKnowledgeEntryAsVerifiedReviewer
// (Phase 3C-2B section 6) already refuse to act unless
// deriveKnowledgeReviewerIdentity (nhei-authority-contract.ts) accepts the
// caller's `role` field - but nothing in this codebase is the thing that
// actually DERIVES that `role` from a real, verified identity and then
// calls those functions. There is no route, no admin page, no CLI script -
// a real human reviewer has no way to approve or reject an entry today,
// other than someone hand-writing a one-off script that still has nowhere
// trustworthy to get `role: 'nhei_knowledge_reviewer'` from, because that
// role is not yet part of this app's real role vocabulary
// (admin-roles.ts's PLATFORM_ADMIN_ROLES/EVOLUTION_ENGINE_ROLES) at all.
//
// THIS FILE is the "minimal administrative review interface or service
// boundary" instruction 3 asks for - a single orchestration function,
// `handleNheiKnowledgeReviewRequest`, that a FUTURE route would call. It is
// deliberately NOT mounted as an Express route anywhere in server.ts, and
// NHEI_KNOWLEDGE_REVIEWER_ROLE is deliberately NOT added to
// admin-roles.ts's real role vocabulary this checkpoint - both would be
// "a publicly available review endpoint" and "changing production roles,"
// which instruction 3 explicitly forbids. What this file DOES do is prove
// the service boundary itself is correct and fully tested, so that the
// only remaining work before a real reviewer can act is:
//   1. A product/governance decision to add 'nhei_knowledge_reviewer' to
//      admin-roles.ts's role vocabulary (or decide it should instead be
//      folded into an existing platform-admin tier - a product call, not
//      an engineering one, deliberately not made here).
//   2. Granting that role to a specific, real, named human reviewer via
//      the EXISTING /api/admin/users/:uid/role route (unchanged,
//      unmodified by this phase) - never a role a reviewer could grant
//      themselves.
//   3. Mounting ONE new route that looks like the snippet in this file's
//      footer comment - calling requireRole(req, [NHEI_KNOWLEDGE_REVIEWER_ROLE])
//      (this app's own existing convention, see server.ts's requireAdmin/
//      requireEvolutionAccess/requireRole, right next to each other) and
//      then this file's handleNheiKnowledgeReviewRequest with the result.
//
// SERVER-SIDE IDENTITY, NOT A REQUEST BODY: handleNheiKnowledgeReviewRequest
// takes `verifiedCaller: NheiVerifiedCaller` as a parameter it trusts
// completely - exactly as risky as that sounds unless the caller of THIS
// function is itself disciplined, which is why this file's own tests (and
// its footer comment) are explicit that verifiedCaller must come from
// requireRole(req, ...) - i.e. Firebase ID token verification plus a
// custom-claims role check already run upstream - never from
// `req.body.role` or any other client-supplied field. This mirrors
// deriveKnowledgeReviewerIdentity's own documented trust boundary exactly;
// this file adds no new trust assumption, it only wires that existing one
// to the two real write functions it was always meant to gate.

import { deriveKnowledgeReviewerIdentity, type NheiVerifiedCaller } from './nhei-authority-contract';
import {
  approveKnowledgeEntryAsVerifiedReviewer,
  rejectKnowledgeEntryAsVerifiedReviewer,
} from './nhei-knowledge-service';
import type { NheiKnowledgeReviewChecklist } from './nhei-knowledge-governance';
import type { FirestoreLike } from './nhei-persistence-service';

export type NheiKnowledgeReviewDecision = 'approve' | 'reject';

export interface NheiKnowledgeReviewRequest {
  entryId: string;
  decision: NheiKnowledgeReviewDecision;
  // Required for 'approve' - the same 8-field checklist
  // NHEI_PHASE3C2B_KNOWLEDGE_REVIEWER_APPROVAL_PROCEDURE.md walks a
  // reviewer through. Ignored (not required) for 'reject', since
  // rejectKnowledgeEntry takes no checklist today.
  checklist?: NheiKnowledgeReviewChecklist;
}

export type NheiKnowledgeReviewBoundaryDenialReason =
  | 'role_not_granted'
  | 'missing_uid'
  | 'invalid_entry_id'
  | 'invalid_decision'
  | 'checklist_required_for_approval';

export interface NheiKnowledgeReviewBoundaryResult {
  ok: boolean;
  reason?: NheiKnowledgeReviewBoundaryDenialReason | string;
}

const MAX_ENTRY_ID_LENGTH = 200;

// The one function a future route calls. Validates the request shape
// itself (never trusting approveKnowledgeEntryAsVerifiedReviewer's own
// deeper validation to catch a wrong-shaped `decision` field first), then
// derives reviewer identity BEFORE doing anything else - a caller with no
// granted role is refused before this function even looks at `entryId`,
// matching "the final approval requires an actual authorised reviewer,"
// checked first, not as an afterthought.
export async function handleNheiKnowledgeReviewRequest(
  db: FirestoreLike,
  verifiedCaller: NheiVerifiedCaller,
  request: NheiKnowledgeReviewRequest,
): Promise<NheiKnowledgeReviewBoundaryResult> {
  const identity = deriveKnowledgeReviewerIdentity(verifiedCaller);
  if (!identity.ok || !identity.reviewerId) {
    return { ok: false, reason: identity.reason ?? 'role_not_granted' };
  }

  if (typeof request?.entryId !== 'string' || request.entryId.length === 0 || request.entryId.length > MAX_ENTRY_ID_LENGTH) {
    return { ok: false, reason: 'invalid_entry_id' };
  }

  if (request.decision === 'approve') {
    if (!request.checklist) return { ok: false, reason: 'checklist_required_for_approval' };
    const result = await approveKnowledgeEntryAsVerifiedReviewer(db, verifiedCaller, request.entryId, request.checklist);
    if (result.ok === false) return { ok: false, reason: result.errors?.join('; ') ?? result.reason };
    return { ok: true };
  }

  if (request.decision === 'reject') {
    const result = await rejectKnowledgeEntryAsVerifiedReviewer(db, verifiedCaller, request.entryId);
    if (result.ok === false) return { ok: false, reason: result.errors?.join('; ') ?? result.reason };
    return { ok: true };
  }

  return { ok: false, reason: 'invalid_decision' };
}

// ---- The exact route a future, separately-approved change would add ----
//
// Not registered anywhere in server.ts - this is documentation, not code
// that runs. Shown here so the "minimal administrative review interface"
// this instruction asks for is concrete, reviewable, and matches this
// app's own existing admin-route conventions (requireRole, right next to
// requireAdmin/requireEvolutionAccess in server.ts) rather than inventing
// a new one:
//
//   app.post(
//     "/api/admin/nhei-knowledge/:entryId/review",
//     verifyAppCheck,
//     authenticateFirebaseUser,
//     async (req, res) => {
//       try {
//         const user = requireRole(req, [NHEI_KNOWLEDGE_REVIEWER_ROLE]);
//         const db = getDb();
//         const result = await handleNheiKnowledgeReviewRequest(
//           db,
//           { uid: user.uid, role: user.role },
//           { entryId: req.params.entryId, decision: req.body.decision, checklist: req.body.checklist },
//         );
//         if (!result.ok) return res.status(403).json({ error: result.reason });
//         res.json({ success: true });
//       } catch (err: any) {
//         res.status(403).json({ error: err.message });
//       }
//     }
//   );
//
// Mounting this (and registering NHEI_KNOWLEDGE_REVIEWER_ROLE in
// admin-roles.ts, and granting it to a real reviewer) is exactly the three
// remaining steps named in this file's header comment - none of which
// this checkpoint performs.

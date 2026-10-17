// NHEI PHASE 3C-2A - SECTION 10: VERIFIED ADMINISTRATIVE AUTHORITY CONTRACT
//
// Audit finding this file exists to close: Phase 3A's
// NheiSystemAuthorityToken (nhei-persistence-service.ts) and Phase 3B's
// reviewerId/authorId parameters (nhei-knowledge-service.ts) both
// correctly prevent a REQUEST BODY from forging a privileged value -
// JSON cannot encode a Symbol, and reviewerId is just a string the
// service layer compares against authorId - but NEITHER of those checks
// establishes that the in-process CALLER constructing that token or
// passing that reviewerId is actually an authorised person. A Symbol
// alone proves "this call went through code that imported this exact
// module," not "a real, permitted reviewer or evidence authority is
// behind this call" - those are different guarantees, and nothing in
// Phase 3A or 3B closed the second one. There is no live route today that
// calls grantNheiSystemAuthority or approveKnowledgeEntry, so this is not
// an active vulnerability - but the contract needs to exist BEFORE such a
// route is ever built, not retrofitted after.
//
// This file defines that missing layer: pure functions that derive a
// privileged NHEI identity ONLY from an already-verified caller object -
// never from anything a request body could carry. "Already-verified"
// means exactly what this app's EXISTING admin-authorisation pattern
// already means elsewhere (see server.ts's requireAuth/requireAdmin/
// requireRole, right above the Evolution Engine's own access guard): a
// `role` claim set via Firebase custom claims, which can only be written
// server-side by an already-admin-gated route
// (/api/admin/users/:uid/role) - never something a client can set on
// itself by sending JSON. This file does not reinvent that
// infrastructure; it reuses the exact same trust boundary and extends it
// to NHEI's two privileged operations.
//
// Nothing in this file is called by server.ts or any route - exactly like
// nhei-extraction-service.ts's createGeminiExtractionCaller, it exists so
// a future, separately-approved route has an already-reviewed,
// already-tested starting point. Per instruction, production-facing
// approval/evidence-authority routes stay OUT of this codebase entirely
// until a route is built against this contract and tested - there is
// nothing disabled here because nothing exists yet to disable.

import { grantNheiSystemAuthority, type NheiSystemAuthorityToken } from './nhei-persistence-service';

// The two new, narrow roles this contract introduces - deliberately NOT
// the general admin/platform_admin roles server.ts's requireAdmin already
// checks. Approving educational content or asserting evidence authority
// are specific, auditable responsibilities, not a side effect of being a
// platform admin for unrelated reasons (billing, support, etc.) - a
// future admin-roles.ts change would need to add these to this app's role
// vocabulary before any real route could grant them; that registration is
// NOT done by this phase, since it is itself route/product-surface work
// this phase's boundaries exclude.
export const NHEI_KNOWLEDGE_REVIEWER_ROLE = 'nhei_knowledge_reviewer';
export const NHEI_EVIDENCE_AUTHORITY_ROLE = 'nhei_evidence_authority';

// The exact minimal shape this file trusts - mirrors what server.ts's
// requireAuth(req) already returns (req.user, populated by Firebase ID
// token verification plus that token's own custom claims). This is NOT a
// request body shape; a caller of this file is expected to have ALREADY
// run requireAuth/requireRole (or an equivalent) before ever constructing
// this object, matching the same discipline requireAdmin/requireRole
// already apply elsewhere in this app.
export interface NheiVerifiedCaller {
  uid: string;
  role?: string;
}

export type NheiAuthorityDenialReason = 'role_not_granted' | 'missing_uid';

export interface NheiReviewerIdentityResult {
  ok: boolean;
  reviewerId?: string;
  reason?: NheiAuthorityDenialReason;
}

// The reviewer identity passed to approveKnowledgeEntry/rejectKnowledgeEntry
// must come from here, never from a request body field named reviewerId -
// the identity is always caller.uid, and caller.uid is only trustworthy
// because it was already verified upstream (Firebase ID token), not
// because this function does anything to re-verify it itself. This
// function's only job is the ROLE check; it is not, and cannot be, a
// substitute for real authentication.
export function deriveKnowledgeReviewerIdentity(caller: NheiVerifiedCaller): NheiReviewerIdentityResult {
  if (!caller.uid) return { ok: false, reason: 'missing_uid' };
  if (caller.role !== NHEI_KNOWLEDGE_REVIEWER_ROLE) return { ok: false, reason: 'role_not_granted' };
  return { ok: true, reviewerId: caller.uid };
}

export interface NheiEvidenceAuthorityResult {
  ok: boolean;
  token?: NheiSystemAuthorityToken;
  reason?: NheiAuthorityDenialReason;
}

// The only place in this codebase (outside nhei-persistence-service.ts
// itself) that is meant to ever call grantNheiSystemAuthority - a future
// route must go through THIS function, never call
// grantNheiSystemAuthority directly with a label built from request data.
// grantedBy is always derived from caller.uid, for the same reason
// reviewerId is always caller.uid above - an auditable, verified label,
// never a free-text field a request could set.
export function deriveEvidenceAuthorityGrant(caller: NheiVerifiedCaller): NheiEvidenceAuthorityResult {
  if (!caller.uid) return { ok: false, reason: 'missing_uid' };
  if (caller.role !== NHEI_EVIDENCE_AUTHORITY_ROLE) return { ok: false, reason: 'role_not_granted' };
  return { ok: true, token: grantNheiSystemAuthority(`nhei_evidence_authority:${caller.uid}`) };
}

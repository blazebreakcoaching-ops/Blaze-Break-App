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
//
// PHASE 3C-2B SECTION 6 VALIDATION: this contract was audited again this
// phase, specifically for whether it is actually WIRED to anything, not
// just correct in isolation. Finding: deriveKnowledgeReviewerIdentity was
// never combined with nhei-knowledge-service.ts's approveKnowledgeEntry/
// rejectKnowledgeEntry - a future route author could have called those
// two functions directly with a request-supplied reviewerId and nothing
// in the type system would have stopped them. Fix: two new functions,
// approveKnowledgeEntryAsVerifiedReviewer/
// rejectKnowledgeEntryAsVerifiedReviewer (nhei-knowledge-service.ts),
// are now the one sanctioned entry point - they call
// deriveKnowledgeReviewerIdentity first and unconditionally, and the
// underlying governance checks (self-approval, checklist completeness)
// never run at all unless that derivation succeeds. End-to-end tests
// (nhei-knowledge-service.test.ts, "Phase 3C-2B section 6" describe
// block) prove an unroled or wrongly-roled caller is denied before
// reaching those checks, and that a correctly-roled caller's audit
// reviewerId is always exactly caller.uid.
//
// deriveEvidenceAuthorityGrant needed no equivalent new wrapper - it
// already IS the sanctioned entry point for minting an
// NheiSystemAuthorityToken - but had never been tested glued to the
// function that actually checks that token
// (nhei-persistence-service.ts's writeNheiEvidence). That gap is now
// closed too (nhei-authority-contract.test.ts, "glued together, end to
// end" describe block): a token derived from a correctly-roled caller
// is proven to actually unlock a privileged SYSTEM_HYPOTHESIS write, and
// a caller lacking the role is proven to never receive a token and to
// have that same write correctly refused.
//
// Residual, disclosed limitation: grantNheiSystemAuthority itself
// (nhei-persistence-service.ts) remains exported and directly callable
// by any code that imports that module - it is not reachable from a
// request body (its brand is a module-private Symbol, see that file's
// comment), but nothing in the TYPE SYSTEM stops a future, careless
// route handler from importing it directly and calling it with a label
// built from request data, bypassing this file's role check entirely.
// The only thing enforcing "route authors must go through
// deriveEvidenceAuthorityGrant, never grantNheiSystemAuthority directly"
// today is this comment and code review discipline, not a compiler
// guarantee. Making grantNheiSystemAuthority module-private would close
// that gap but would also break grantNheiSystemAuthority's direct use as
// a test fixture helper across nhei-persistence-service.test.ts and
// nhei-context-integration.test.ts - a larger, riskier change this
// checkpoint's "preserve existing tests and interfaces where possible"
// instruction counsels against making without a dedicated pass. Flagged
// here explicitly, as a known gap, rather than silently left unstated:
// a real administrative route built against this contract must be
// reviewed for this specifically before it ships.

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

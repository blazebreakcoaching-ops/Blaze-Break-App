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
// PHASE 3C-2B SECTION 6 VALIDATION: this contract was audited again that
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
// PHASE 3C-2B CHECKPOINT 2 SECTION 7: Checkpoint 1 disclosed a residual
// gap here and deliberately did not fix it that checkpoint: the
// underlying grantNheiSystemAuthority (nhei-persistence-service.ts)
// remained exported and directly importable by any code, meaning nothing
// in the TYPE SYSTEM stopped a future, careless route handler from
// bypassing deriveEvidenceAuthorityGrant's role check entirely. This
// checkpoint closes it: grantNheiSystemAuthority no longer exists as an
// export of that module at all. deriveEvidenceAuthorityGrant itself has
// MOVED into nhei-persistence-service.ts (the only module that still
// holds the actual minting function, now module-private), and this file
// re-exports it below so every existing caller of
// `deriveEvidenceAuthorityGrant`/`NHEI_EVIDENCE_AUTHORITY_ROLE` from
// `./nhei-authority-contract` keeps working unchanged - the public name
// is stable even though the implementation now lives where the thing it
// protects (writeNheiEvidence) also lives. There is now exactly one way
// to obtain a real token from outside nhei-persistence-service.ts:
// deriveEvidenceAuthorityGrant with a correctly-roled caller. Legitimate
// test access is preserved through a separate, loudly-named test-only
// export (grantNheiSystemAuthorityForTestingOnly) that no production
// route may import without that import itself being the review flag.
// nhei-persistence-service.ts's own header comment on this has the full
// detail; this file only re-exports.

import {
  deriveEvidenceAuthorityGrant,
  NHEI_EVIDENCE_AUTHORITY_ROLE,
  type NheiEvidenceAuthorityResult,
  type NheiEvidenceAuthorityDenialReason,
  type NheiVerifiedEvidenceAuthorityCaller,
} from './nhei-persistence-service';

export { deriveEvidenceAuthorityGrant, NHEI_EVIDENCE_AUTHORITY_ROLE };
export type { NheiEvidenceAuthorityResult, NheiEvidenceAuthorityDenialReason, NheiVerifiedEvidenceAuthorityCaller };

// The one role this contract still defines locally - deliberately NOT
// the general admin/platform_admin roles server.ts's requireAdmin already
// checks. Approving educational content is a specific, auditable
// responsibility, not a side effect of being a platform admin for
// unrelated reasons (billing, support, etc.) - a future admin-roles.ts
// change would need to add this to this app's role vocabulary before any
// real route could grant it; that registration is NOT done by this
// phase, since it is itself route/product-surface work this phase's
// boundaries exclude.
export const NHEI_KNOWLEDGE_REVIEWER_ROLE = 'nhei_knowledge_reviewer';

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

// deriveEvidenceAuthorityGrant and NHEI_EVIDENCE_AUTHORITY_ROLE used to be
// defined here, wrapping an imported grantNheiSystemAuthority. As of
// Phase 3C-2B Checkpoint 2 section 7 (see this file's header comment),
// both now live in nhei-persistence-service.ts itself (the module that
// also mints and verifies the token) and are re-exported at the top of
// this file for backward compatibility - nothing below this point
// redefines them.

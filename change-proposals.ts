// Change Proposal workflow + Governance Tiers (Evolution Engine PR8).
//
// The Governance Tier vocabulary is NOT reinvented here - it reuses
// protected-core.ts's real APPROVAL_TIERS ('owner_only',
// 'platform_admin_review', 'technical_review', 'none'), the exact same
// tiers already attached to every real Protected Core invariant since
// PR2. A proposal's required tier is DERIVED from what it targets,
// never typed in by hand as a free-text severity - a human choosing
// "this feels like a big change" is exactly the kind of invented
// judgement call this spec's governance model exists to replace with a
// real, inspectable rule.
//
// Deliberately does NOT let a Protected Core proposal auto-apply once
// approved (see server.ts's apply route) - Protected Core mutations
// already require a Platform Owner to directly re-verify the evidence
// behind an invariant (see protected-core.ts's own module docstring);
// routing that through a generic "apply this JSON patch" action here
// would quietly bypass that re-verification step. A feature registry
// proposal CAN auto-apply, because the registry's own direct upsert
// route (POST /api/admin/evolution/registry) already accepts exactly
// this kind of patch from anyone with Evolution Engine access - approval
// adds a real gate in front of an action that was already this reversible.

import { ApprovalTier } from './protected-core';
import { LifecycleState } from './feature-registry-v2';
import { isPlatformAdminRole, isEvolutionEngineRole } from './admin-roles';

export const PROPOSAL_TARGET_TYPES = ['feature_registry', 'protected_core'] as const;
export type ProposalTargetType = (typeof PROPOSAL_TARGET_TYPES)[number];
export const isProposalTargetType = (value: unknown): value is ProposalTargetType =>
  typeof value === 'string' && (PROPOSAL_TARGET_TYPES as readonly string[]).includes(value);

export const PROPOSAL_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'applied', 'withdrawn'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const isProposalStatus = (value: unknown): value is ProposalStatus =>
  typeof value === 'string' && (PROPOSAL_STATUSES as readonly string[]).includes(value);

export interface ChangeProposal {
  proposalId: string;
  targetType: ProposalTargetType;
  targetId: string;
  title: string;
  rationale: string;
  proposedChanges: Record<string, unknown>;
  requiredApproval: ApprovalTier;
  status: ProposalStatus;
  proposedBy: string;
  proposedByEmail: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Only the feature-registry case needs deriving - a Protected Core
// target always uses that invariant's OWN already-real requiredApproval
// field directly (the caller reads it straight off the invariant doc;
// there is nothing to derive).
//
// 'live'/'public_beta' features have real users depending on current
// behaviour today, so a change needs platform-admin eyes. 'private_beta'/
// 'internal_beta' are still controlled-exposure, so technical review is
// enough. Anything else (draft/shadow/frozen/deprecated/removed) has no
// live audience to protect, so no approval is required to even consider
// the change - though submitting it is still logged either way.
export const deriveFeatureRegistryApprovalTier = (lifecycleState: LifecycleState): ApprovalTier => {
  if (lifecycleState === 'live' || lifecycleState === 'public_beta') return 'platform_admin_review';
  if (lifecycleState === 'private_beta' || lifecycleState === 'internal_beta') return 'technical_review';
  return 'none';
};

// Whether `role` can approve/reject a proposal carrying `tier`.
// `isPlatformOwner` is passed in separately (not derived from `role`
// here) because owner status in this codebase is also granted via the
// email-based bootstrap allowlist (isOwnerBootstrapEmail), independent
// of the stored role string - the same pattern requireEvolutionAccess/
// requirePlatformOwner already use in server.ts.
export const canDecideProposal = (tier: ApprovalTier, role: string | undefined, isPlatformOwner: boolean): boolean => {
  if (isPlatformOwner) return true;
  switch (tier) {
    case 'owner_only':
      return false;
    case 'platform_admin_review':
      return isPlatformAdminRole(role);
    case 'technical_review':
    case 'none':
      return isPlatformAdminRole(role) || isEvolutionEngineRole(role);
  }
};

const ALLOWED_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['approved', 'rejected', 'withdrawn'],
  approved: ['applied', 'withdrawn'],
  rejected: [],
  applied: [],
  withdrawn: [],
};

export const canTransitionProposalStatus = (from: ProposalStatus, to: ProposalStatus): boolean =>
  ALLOWED_TRANSITIONS[from].includes(to);

export interface ChangeProposalValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_TITLE = 200;
const MAX_RATIONALE = 2000;
const MAX_TARGET_ID = 200;

export const validateChangeProposalCreate = (input: unknown): ChangeProposalValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A change proposal object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (!isProposalTargetType(c.targetType)) {
    return { valid: false, error: `"targetType" must be one of: ${PROPOSAL_TARGET_TYPES.join(', ')}.` };
  }
  if (typeof c.targetId !== 'string' || c.targetId.length === 0 || c.targetId.length > MAX_TARGET_ID) {
    return { valid: false, error: `"targetId" is required (max ${MAX_TARGET_ID} characters).` };
  }
  if (typeof c.title !== 'string' || c.title.trim().length === 0 || c.title.length > MAX_TITLE) {
    return { valid: false, error: `"title" is required (max ${MAX_TITLE} characters).` };
  }
  if (typeof c.rationale !== 'string' || c.rationale.trim().length === 0 || c.rationale.length > MAX_RATIONALE) {
    return { valid: false, error: `"rationale" is required (max ${MAX_RATIONALE} characters).` };
  }
  if (!c.proposedChanges || typeof c.proposedChanges !== 'object' || Array.isArray(c.proposedChanges)) {
    return { valid: false, error: '"proposedChanges" must be an object.' };
  }
  return { valid: true };
};

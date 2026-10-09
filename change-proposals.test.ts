import { describe, it, expect } from 'vitest';
import {
  deriveFeatureRegistryApprovalTier,
  canDecideProposal,
  canTransitionProposalStatus,
  validateChangeProposalCreate,
} from './change-proposals';

describe('deriveFeatureRegistryApprovalTier', () => {
  it('requires platform admin review for live and public_beta', () => {
    expect(deriveFeatureRegistryApprovalTier('live')).toBe('platform_admin_review');
    expect(deriveFeatureRegistryApprovalTier('public_beta')).toBe('platform_admin_review');
  });
  it('requires technical review for private_beta and internal_beta', () => {
    expect(deriveFeatureRegistryApprovalTier('private_beta')).toBe('technical_review');
    expect(deriveFeatureRegistryApprovalTier('internal_beta')).toBe('technical_review');
  });
  it('requires no approval for draft/shadow/frozen/deprecated/removed', () => {
    for (const state of ['draft', 'shadow', 'frozen', 'deprecated', 'removed'] as const) {
      expect(deriveFeatureRegistryApprovalTier(state)).toBe('none');
    }
  });
});

describe('canDecideProposal', () => {
  it('lets a platform owner decide any tier', () => {
    for (const tier of ['owner_only', 'platform_admin_review', 'technical_review', 'none'] as const) {
      expect(canDecideProposal(tier, undefined, true)).toBe(true);
    }
  });
  it('never lets a non-owner decide an owner_only proposal', () => {
    expect(canDecideProposal('owner_only', 'platform_admin', false)).toBe(false);
    expect(canDecideProposal('owner_only', 'security_admin', false)).toBe(false);
  });
  it('lets a platform-admin-role decide platform_admin_review, but not an evolution-only role that is not a platform admin role', () => {
    expect(canDecideProposal('platform_admin_review', 'platform_admin', false)).toBe(true);
    expect(canDecideProposal('platform_admin_review', 'support_admin', false)).toBe(true);
    expect(canDecideProposal('platform_admin_review', 'individual', false)).toBe(false);
  });
  it('lets any evolution-engine or platform-admin role decide technical_review/none', () => {
    expect(canDecideProposal('technical_review', 'security_admin', false)).toBe(true);
    expect(canDecideProposal('none', 'platform_admin', false)).toBe(true);
    expect(canDecideProposal('technical_review', 'individual', false)).toBe(false);
  });
});

describe('canTransitionProposalStatus', () => {
  it('allows the real documented transitions', () => {
    expect(canTransitionProposalStatus('draft', 'submitted')).toBe(true);
    expect(canTransitionProposalStatus('draft', 'withdrawn')).toBe(true);
    expect(canTransitionProposalStatus('submitted', 'approved')).toBe(true);
    expect(canTransitionProposalStatus('submitted', 'rejected')).toBe(true);
    expect(canTransitionProposalStatus('approved', 'applied')).toBe(true);
    expect(canTransitionProposalStatus('approved', 'withdrawn')).toBe(true);
  });
  it('rejects transitions out of terminal states', () => {
    for (const terminal of ['rejected', 'applied', 'withdrawn'] as const) {
      for (const to of ['draft', 'submitted', 'approved', 'rejected', 'applied', 'withdrawn'] as const) {
        expect(canTransitionProposalStatus(terminal, to)).toBe(false);
      }
    }
  });
  it('rejects skipping a step', () => {
    expect(canTransitionProposalStatus('draft', 'approved')).toBe(false);
    expect(canTransitionProposalStatus('draft', 'applied')).toBe(false);
    expect(canTransitionProposalStatus('submitted', 'applied')).toBe(false);
  });
});

describe('validateChangeProposalCreate', () => {
  const validInput = () => ({
    targetType: 'feature_registry' as const,
    targetId: 'energy_budget',
    title: 'Mark energy_budget as fully enforced',
    rationale: 'Verified the flag is read at App.tsx:123.',
    proposedChanges: { enforcementState: 'fully_enforced' },
  });

  it('accepts a valid proposal', () => {
    expect(validateChangeProposalCreate(validInput())).toEqual({ valid: true });
  });
  it('rejects a missing/invalid targetType', () => {
    expect(validateChangeProposalCreate({ ...validInput(), targetType: 'nonsense' }).valid).toBe(false);
  });
  it('rejects an empty title', () => {
    expect(validateChangeProposalCreate({ ...validInput(), title: '' }).valid).toBe(false);
  });
  it('rejects an empty rationale', () => {
    expect(validateChangeProposalCreate({ ...validInput(), rationale: '   ' }).valid).toBe(false);
  });
  it('rejects a non-object proposedChanges', () => {
    expect(validateChangeProposalCreate({ ...validInput(), proposedChanges: 'not an object' }).valid).toBe(false);
    expect(validateChangeProposalCreate({ ...validInput(), proposedChanges: ['a'] }).valid).toBe(false);
  });
  it('rejects a non-object input', () => {
    expect(validateChangeProposalCreate(null).valid).toBe(false);
    expect(validateChangeProposalCreate('x').valid).toBe(false);
  });
});

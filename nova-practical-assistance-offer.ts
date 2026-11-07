// Phase 5K (Nova Unified Intelligence & Experience) - the "coordinator"
// tool that lets a Nova conversation (text or voice - both already
// share the same NOVA_TOOLS array and executeNovaTool dispatcher in
// server.ts, confirmed by this phase's own audit) offer the user Nova's
// existing practical-assistance workflow (Invisible Load -> Calendar
// Protection / Task Deferral) instead of leaving those fully-built,
// fully-tested, already-execution-disabled workflows reachable only
// through a dev preview page nobody real ever opens.
//
// Mirrors guardian-support-invitation.ts's validateGuardianSupportOffer
// exactly - the same reasoning applies: this is the ONLY thing the
// model's own judgement is allowed to influence (a boolean UI-rendering
// decision), never anything that itself proposes, schedules, or changes
// a real commitment. Every actual action inside the workflow this card
// opens still goes through its own separate, pre-existing review/
// approval screens and its own hardcoded execution-disabled kill
// switches (CALENDAR_PROTECTION_EXECUTION_ENABLED etc) - unaffected by
// whether this card exists.

export interface PracticalAssistanceOfferValidationResult {
  valid: boolean;
  error?: string;
}

export const validatePracticalAssistanceOffer = (args: { reason?: unknown }): PracticalAssistanceOfferValidationResult => {
  if (typeof args.reason !== 'string' || args.reason.trim().length === 0) {
    return { valid: false, error: 'Offering practical assistance needs a real, specific reason tied to what the user just said - not a generic one.' };
  }
  if (args.reason.length > 200) {
    return { valid: false, error: 'Keep the reason under 200 characters.' };
  }
  return { valid: true };
};

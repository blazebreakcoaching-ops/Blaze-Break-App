export type ManualPlanId = 'free' | 'core' | 'performance' | 'executive';
export type ManualPlanCadence = 'monthly' | 'annual';

const SUPPORT_ADDRESS = 'support@blazebreak.app';

/**
 * Until payment integration is ready, a plan request is just an email
 * the user reviews and sends. This does NOT charge, provision an
 * entitlement, or claim that the plan is already available.
 */
export function buildManualPlanRequestUrl(
  plan: ManualPlanId, cadence: ManualPlanCadence,
): string {
  const title = plan === 'executive' ? 'Executive plan'
    : plan === 'performance' ? 'Performance'
    : plan === 'core' ? 'Core' : 'Free';
  const subject = `Blaze Break — ${title} plan enquiry`;
  const body = `Hello Blaze Break support,\n\nI would like to enquire about the ${title} plan (${cadence}). Please let me know whether a manual change is currently available.\n\nThank you.`;
  return `mailto:${SUPPORT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

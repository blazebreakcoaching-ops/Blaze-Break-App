import { describe, expect, it } from 'vitest';
import { buildManualPlanRequestUrl } from './manual-plan-request';

describe('manual plan enquiry before Stripe is enabled', () => {
  it('opens a draft addressed to the published support mailbox', () => {
    const url = buildManualPlanRequestUrl('core', 'monthly');
    expect(url).toMatch(/^mailto:support@blazebreak\.app\?/);
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('subject')).toContain('Core plan enquiry');
    expect(params.get('body')).toContain('monthly');
  });
  it('does not take payment or claim an entitlement was granted', () => {
    const value = buildManualPlanRequestUrl('executive', 'annual');
    expect(value).toContain('mailto:');
    expect(decodeURIComponent(value)).toContain('Executive plan');
    expect(value).not.toContain('checkout');
    expect(value).not.toContain('stripe');
  });
});

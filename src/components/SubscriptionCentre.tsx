import React, { useState, useEffect } from 'react';
import { CreditCard, Loader2, Check, Sparkles, ShieldCheck, Mail } from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';

// Reads entirely from GET /api/entitlements/me and GET /api/entitlements/pricing
// (entitlements.ts / server.ts) - nothing here hardcodes a price or a
// capability limit, so this page can never drift from what's actually
// enforced server-side. See docs/FREE_PREMIUM_ENTITLEMENTS.md.
//
// "Executive" naming note: this page always writes "Executive plan"
// rather than a bare "Executive" - the word already names several other
// unrelated things in this product (an Energy Budget task category, the
// ExecutiveBoardReport org feature, an onboarding persona label). See
// docs/FREE_PREMIUM_ENTITLEMENTS.md's naming-collision section.

type PlanId = 'free' | 'core' | 'performance' | 'executive';

interface CapabilityUsage {
  enabled: boolean;
  limit: number | null;
  resetPeriod?: string;
  unit?: string;
  used: number;
}

interface EntitlementMe {
  plan: PlanId | 'legacy_premium';
  status: string;
  billingSource: string | null;
  entitlementEnd: string | null;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  capabilities: Record<string, CapabilityUsage>;
}

interface PricingPlan {
  plan: PlanId;
  pricing: { monthlyGbp: number; annualGbp: number | null };
  annualSavingsGbp: number | null;
  mostPopular: boolean;
  capabilities: Record<string, { enabled: boolean; limit: number | null; fallback?: string }>;
}

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  core: 'Core',
  performance: 'Performance',
  executive: 'Executive plan',
  legacy_premium: 'Premium (legacy)',
};

const PLAN_BLURB: Record<PlanId, string> = {
  free: 'Try Blaze Break for real - every core tool, no time limit.',
  core: 'The full product: Nova coaching, energy budgeting, and boundary practice without daily friction.',
  performance: 'Ascending Nova depth and weekly intelligence for people actively rebuilding.',
  executive: 'The highest ceilings, plus priority-booking benefits for 1:1 Executive Coaching.',
};

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

function UsageBar({ label, used, limit, unit }: { label: string; used: number; limit: number | null; unit?: string }) {
  if (limit === null) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="font-bold text-success dark:text-[#4ade80]">Unlimited</span>
      </div>
    );
  }
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const suffix = unit === 'minutes' ? 'min' : '';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="font-bold text-text-main">{used}{suffix} / {limit}{suffix}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const SubscriptionCentre = () => {
  const [me, setMe] = useState<EntitlementMe | null>(null);
  const [pricing, setPricing] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [cadence, setCadence] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, pricingRes] = await Promise.all([
          secureApiFetch('/api/entitlements/me'),
          secureApiFetch('/api/entitlements/pricing'),
        ]);
        if (meRes.ok) setMe(await meRes.json());
        if (pricingRes.ok) setPricing((await pricingRes.json()).plans || []);
      } catch (e) {
        // Leaves the honest loading-failed state below rather than pretending data loaded.
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!me) {
    return (
      <p className="text-sm text-text-muted italic text-center py-12">
        Couldn't load your subscription right now. Please try again shortly.
      </p>
    );
  }

  const currentPlanLabel = PLAN_LABEL[me.plan] || me.plan;
  const voiceMinutes = me.capabilities.nova_voice_minutes;
  const smsNudges = me.capabilities.sms_nudges;

  return (
    <div className="space-y-12">
      {/* Current plan + usage */}
      <div className="card space-y-6 bg-background shadow-lg border border-border">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center text-primary">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-main tracking-tight">Your plan: {currentPlanLabel}</h2>
              <p className="text-xs text-text-muted mt-1">
                {me.status === 'active' ? 'Active' : me.status}
                {me.cancelAtPeriodEnd && me.entitlementEnd ? ` · ends ${new Date(me.entitlementEnd).toLocaleDateString()}` : ''}
                {me.renewalDate ? ` · renews ${new Date(me.renewalDate).toLocaleDateString()}` : ''}
              </p>
            </div>
          </div>
        </div>

        {(voiceMinutes || smsNudges) && (
          <div className="grid sm:grid-cols-2 gap-6 pt-2">
            {voiceMinutes && (
              <UsageBar label="Nova Live voice minutes (this month)" used={voiceMinutes.used} limit={voiceMinutes.limit} unit="minutes" />
            )}
            {smsNudges && smsNudges.enabled && (
              <UsageBar label="Text nudges (this month)" used={smsNudges.used} limit={smsNudges.limit} />
            )}
            {smsNudges && !smsNudges.enabled && (
              <div className="text-xs text-text-muted">
                Text nudges: not included on your plan - you'll still get every nudge by push, in-app, and email.
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-text-muted bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
          <ShieldCheck className="w-4 h-4 shrink-0 text-success dark:text-[#4ade80] mt-0.5" />
          <span>Account security, privacy controls, account deletion, and Guardian Support are never limited by plan - on every tier, including Free.</span>
        </div>
      </div>

      {/* Pricing comparison */}
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-bold text-text-main tracking-tight">Compare plans</h3>
            <p className="text-xs text-text-muted mt-1">Prices shown are the current standard rate for new subscriptions.</p>
          </div>
          <div className="inline-flex items-center rounded-xl border border-white/10 p-1 bg-white/[0.03]">
            <button
              onClick={() => setCadence('monthly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${cadence === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-text-muted'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCadence('annual')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${cadence === 'annual' ? 'bg-primary text-primary-foreground' : 'text-text-muted'}`}
            >
              Annual
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {pricing.map((p) => {
            const isCurrent = me.plan === p.plan || (me.plan === 'legacy_premium' && p.plan === 'performance');
            const price = cadence === 'annual' && p.pricing.annualGbp !== null ? p.pricing.annualGbp : p.pricing.monthlyGbp;
            return (
              <div
                key={p.plan}
                className={`relative flex flex-col rounded-2xl border p-6 space-y-4 ${p.mostPopular ? 'border-primary bg-primary/[0.04]' : 'border-white/10 bg-surface'}`}
              >
                {p.mostPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                    <Sparkles className="w-3 h-3" /> Most Popular
                  </span>
                )}
                <div>
                  <h4 className="font-bold text-text-main">{PLAN_LABEL[p.plan]}</h4>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">{PLAN_BLURB[p.plan]}</p>
                </div>
                <div>
                  <span className="text-3xl font-black text-text-main">{gbp(price)}</span>
                  <span className="text-xs text-text-muted">{p.plan === 'free' ? '' : cadence === 'annual' ? '/year' : '/month'}</span>
                  {cadence === 'annual' && p.annualSavingsGbp ? (
                    <p className="text-[11px] text-success dark:text-[#4ade80] font-bold mt-1">Save {gbp(p.annualSavingsGbp)}/year</p>
                  ) : null}
                </div>
                <ul className="text-xs text-text-muted space-y-2 flex-1">
                  {p.capabilities.nova_text && <li className="flex gap-2"><Check className="w-3.5 h-3.5 text-success dark:text-[#4ade80] shrink-0" /> Nova chat, {p.capabilities.nova_text.limit}/day</li>}
                  {p.capabilities.nova_voice && <li className="flex gap-2"><Check className="w-3.5 h-3.5 text-success dark:text-[#4ade80] shrink-0" /> Nova Live voice, {p.capabilities.nova_voice.limit}/day</li>}
                  {p.capabilities.nova_voice_minutes && <li className="flex gap-2"><Check className="w-3.5 h-3.5 text-success dark:text-[#4ade80] shrink-0" /> {p.capabilities.nova_voice_minutes.limit === null ? 'Unlimited' : p.capabilities.nova_voice_minutes.limit} voice minutes/month</li>}
                  <li className="flex gap-2">
                    <Check className={`w-3.5 h-3.5 shrink-0 ${p.capabilities.sms_nudges?.enabled ? 'text-success dark:text-[#4ade80]' : 'text-text-muted'}`} />
                    {p.capabilities.sms_nudges?.enabled ? `Text nudges, ${p.capabilities.sms_nudges.limit}/month` : 'Nudges by push/in-app/email'}
                  </li>
                  {p.plan === 'executive' && <li className="flex gap-2"><Check className="w-3.5 h-3.5 text-success dark:text-[#4ade80] shrink-0" /> Priority booking + discount on 1:1 Executive Coaching</li>}
                </ul>
                <button
                  disabled={isCurrent}
                  className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
                    isCurrent
                      ? 'bg-white/[0.05] text-text-muted cursor-default'
                      : 'bg-primary/10 hover:bg-primary/20 text-[#9a3412] dark:text-primary'
                  }`}
                >
                  {isCurrent ? 'Current plan' : `Request ${PLAN_LABEL[p.plan]}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Checkout readiness - honest, no live payment yet */}
      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <Mail className="w-5 h-5 shrink-0 text-primary mt-0.5" />
        <div className="text-xs text-text-muted leading-relaxed">
          <p className="font-bold text-text-main mb-1">Plan changes are handled by our team today, not an automatic checkout.</p>
          <p>
            We don't yet have card payments connected in the app. Tap "Request" above,
            or contact support, and we'll set up your plan change by hand - usually
            same day. This never affects your account security, privacy, or Guardian
            Support, which are always available regardless of plan.
          </p>
        </div>
      </div>
    </div>
  );
};

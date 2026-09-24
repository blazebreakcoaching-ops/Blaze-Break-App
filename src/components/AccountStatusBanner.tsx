import { useEffect, useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';

// Same plan vocabulary as SubscriptionCentre.tsx (entitlements.ts,
// server-authoritative) - only the one field this banner actually needs,
// not the full EntitlementMe shape SubscriptionCentre reads.
type PlanId = 'free' | 'core' | 'performance' | 'executive' | 'legacy_premium';

interface AccountStatusBannerProps {
  // True for a fresh anonymous visitor viewing the sample dashboard (see
  // App.tsx's isDemoSession) - never fetches a plan in this state, since
  // there's nothing to fetch yet.
  isDemoSession: boolean;
  onSignUp: () => void;
  onNavigateUpgrade: () => void;
}

// Persistent, always-visible (mounted once in App.tsx, not per-tab) - one
// of two honest states, never both, matching the product's "one clear
// next step per page" rule:
//   1. Demo session -> "you're viewing a sample" + Sign up.
//   2. Real signed-in Free-tier account -> "you're on Free" + Upgrade.
// Anything else (a paid tier, or the plan still loading) renders nothing.
export const AccountStatusBanner = ({ isDemoSession, onSignUp, onNavigateUpgrade }: AccountStatusBannerProps) => {
  const [plan, setPlan] = useState<PlanId | null>(null);

  useEffect(() => {
    if (isDemoSession) return; // nothing to fetch yet for a visitor with no real account
    let cancelled = false;
    secureApiFetch('/api/entitlements/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setPlan(data?.plan ?? null); })
      .catch(() => {
        // Leaves plan as null - the banner just stays hidden rather than
        // showing a stale/wrong upgrade prompt on a fetch failure.
      });
    return () => { cancelled = true; };
  }, [isDemoSession]);

  if (isDemoSession) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 mb-6 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <p className="text-xs text-text-main">
            <span className="uppercase tracking-widest font-black text-primary">Sample account</span>
            {' '}— example progress, not your own. Sign up free to start tracking your own recovery.
          </p>
        </div>
        <button
          type="button"
          onClick={onSignUp}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-full hover:scale-[1.03] active:scale-95 transition-all shadow-sm"
        >
          Sign up free <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (plan !== 'free') return null;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 mb-6 rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2.5 min-w-0">
        <Sparkles className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
        <p className="text-xs text-text-main">
          <span className="uppercase tracking-widest font-black text-text-muted">Free plan</span>
          {' '}— upgrade for deeper Nova coaching and more voice minutes.
        </p>
      </div>
      <button
        type="button"
        onClick={onNavigateUpgrade}
        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text-main text-xs font-bold uppercase tracking-widest rounded-full hover:border-primary/50 hover:text-primary transition-colors shadow-sm"
      >
        Upgrade <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

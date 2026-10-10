// Work Design Pulse (PR3): the real employee-facing page that replaces the
// old dead-end "Admin Access Required" wall every non-admin, org-linked
// member used to hit on the "org" tab. An employee isn't an admin, but they
// aren't nothing to this page either - this is their own honest view of
// how their organisation's Work Design Pulse actually works right now,
// built entirely from routes already open to any member (my-privacy-status,
// privacy-receipts, work-design-interventions-summary) plus the existing
// Anonymous Team Voice box - no new aggregate ever bypasses the privacy
// wall those routes already enforce.
import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, History, Users, ClipboardList,
} from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';
import { cn } from '../lib/utils';
import { AnonymousSuggestionBox } from './AnonymousSuggestionBox';

interface TrustMirrorCategory { key: string; label: string; active: boolean; basis: string }
interface PrivacyStatus {
  minimumGroupSize: number;
  orgCohortSufficient: boolean;
  myTeam: string | null;
  myTeamCohortSufficient: boolean | null;
  canSee: TrustMirrorCategory[];
  cannotSee: string[];
}
interface PrivacyReceipt { id: string; category: string; summary: string; createdAt: string | null }
interface InterventionSummary { totalTried: number; byStatus: Record<string, number>; byOutcome: Record<string, number> }

const STATUS_LABELS: Record<string, string> = {
  suggested: 'Suggested', under_review: 'Under Review', approved: 'Approved',
  trialling: 'Trialling', active: 'Active', review_due: 'Review Due',
  completed: 'Completed', stopped: 'Stopped', no_benefit: 'No Clear Benefit', changed: 'Changed Again',
};
const OUTCOME_LABELS: Record<string, string> = {
  useful: 'Useful', partly_useful: 'Partly Useful', no_clear_difference: 'No Clear Difference',
  created_another_problem: 'Created Another Problem', stopped_early: 'Stopped Early',
};

export const WorkDesignPulseEmployeeView = ({ orgId, organisationName }: { orgId: string; organisationName?: string }) => {
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus | null>(null);
  const [receipts, setReceipts] = useState<PrivacyReceipt[]>([]);
  const [interventions, setInterventions] = useState<InterventionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [statusRes, receiptsRes, interventionsRes] = await Promise.all([
          secureApiFetch(`/api/org/${orgId}/my-privacy-status`),
          secureApiFetch(`/api/org/${orgId}/privacy-receipts`),
          secureApiFetch(`/api/org/${orgId}/work-design-interventions-summary`),
        ]);
        if (statusRes.ok) setPrivacyStatus(await statusRes.json());
        if (receiptsRes.ok) setReceipts((await receiptsRes.json()).receipts || []);
        if (interventionsRes.ok) setInterventions(await interventionsRes.json());
      } catch (e) {
        // Non-fatal - each section below just stays hidden if its own fetch failed.
      }
      setLoading(false);
    };
    load();
  }, [orgId]);

  if (loading) {
    return <div className="p-12 text-center text-text-muted text-sm">Loading your Work Design Pulse...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-text-main">Your Work Design Pulse</h3>
        <p className="text-text-muted text-sm mt-1 max-w-2xl">
          How work is structured at {organisationName || 'your organisation'}, where unnecessary pressure is building, and what's being done about it — built entirely from aggregate signals, never your private recovery data.
        </p>
      </div>

      {/* 1. Trust Mirror */}
      {privacyStatus && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
          <h4 className="text-sm font-bold text-text-main flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> What My Organisation Can See</h4>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h5 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Currently Active</h5>
              <ul className="space-y-2 text-xs text-text-muted">
                {privacyStatus.canSee.map((cat) => (
                  <li key={cat.key} className="flex items-start gap-2">
                    {cat.active
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                      : <Clock className="w-3.5 h-3.5 text-text-muted mt-0.5 shrink-0" />}
                    <span>
                      <span className={cn(cat.active ? "text-text-main font-semibold" : "")}>{cat.label}</span>
                      <span className="block text-text-muted/80 mt-0.5">{cat.basis}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h5 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Never Visible To Your Organisation</h5>
              <ul className="space-y-2 text-xs text-text-muted">
                {privacyStatus.cannotSee.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <XCircle className="w-3.5 h-3.5 text-text-muted mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 2. Your Team's Standing */}
      {privacyStatus && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-3">
          <h4 className="text-sm font-bold text-text-main flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Your Team's Standing</h4>
          <ul className="space-y-2 text-xs text-text-muted">
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <span>Your organisation requires at least <strong className="text-text-main">{privacyStatus.minimumGroupSize}</strong> consenting teammates before any aggregate is ever shown.</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <span>{privacyStatus.orgCohortSufficient ? 'Your organisation currently has enough consenting teammates for org-wide trends to show.' : "Your organisation doesn't currently have enough consenting teammates for anything org-wide to show."}</span>
            </li>
            {privacyStatus.myTeam && (
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <span>{privacyStatus.myTeamCohortSufficient ? `Your team (${privacyStatus.myTeam}) currently has enough consenting teammates for its own trends to show.` : `Your team (${privacyStatus.myTeam}) doesn't currently have enough consenting teammates for anything specific to it to show.`}</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 3. What Your Organisation Has Tried */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-3">
        <h4 className="text-sm font-bold text-text-main flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary" /> What Your Organisation Has Tried</h4>
        {interventions && interventions.totalTried > 0 ? (
          <>
            <p className="text-xs text-text-muted">
              {interventions.totalTried} work-design change{interventions.totalTried === 1 ? '' : 's'} recorded so far, across every team — never broken down by team or person here, since a small team's name could itself identify who's involved.
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(interventions.byStatus).map(([status, count]) => (
                <span key={status} className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-text-main">
                  {STATUS_LABELS[status] || status}: <strong>{count}</strong>
                </span>
              ))}
            </div>
            {Object.keys(interventions.byOutcome).length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(interventions.byOutcome).map(([outcome, count]) => (
                  <span key={outcome} className="px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-text-main">
                    {OUTCOME_LABELS[outcome] || outcome}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-text-muted">Your organisation hasn't recorded a work-design change yet.</p>
        )}
      </div>

      {/* 4. Recent Privacy Changes */}
      {receipts.length > 0 && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-3">
          <h4 className="text-sm font-bold text-text-main flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Recent Privacy Changes</h4>
          <ul className="space-y-3">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="flex items-start gap-2 text-xs">
                <History className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <span className="text-text-muted">
                  {receipt.summary}
                  {receipt.createdAt && <span className="block text-text-muted/60 mt-0.5">{new Date(receipt.createdAt).toLocaleDateString()}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Your Voice */}
      <div className="p-6 rounded-2xl bg-surface border border-border">
        <AnonymousSuggestionBox orgId={orgId} organisationName={organisationName} />
      </div>
    </div>
  );
};

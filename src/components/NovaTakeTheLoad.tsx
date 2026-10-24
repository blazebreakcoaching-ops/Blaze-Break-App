import { useState, useEffect } from 'react';
import { CalendarClock, ShieldCheck, ShieldOff, History, Undo2, RotateCcw, AlertTriangle, CheckCircle2, XCircle, HelpCircle, ThumbsUp, Pencil } from 'lucide-react';
import { secureApiFetch, SecureApiError } from '../lib/secure-api.ts';

// Nova Take the Load - Calendar Protection UI (Phase 5D, directive §2).
//
// The first real, end-to-end Agentic Nova interface: every action here
// calls one of the real server.ts routes backed by
// nova-calendar-protection-service.ts - propose, present, approve,
// execute, retry, undo, plus the read-only history/status routes and the
// separate allowCalendarActions permission routes (directive §3). There
// is no simulated state anywhere in this component: what you see on
// screen is exactly what the server actually stored, including the
// honest fact that execution is disabled platform-wide today (directive
// §5) - "no simulated control should pretend a real external change
// occurred."
//
// THE SUGGESTED-VS-EXECUTED DISTINCTION (directive §9's own words: "make
// the difference between a suggested action and an executed action
// unmistakable") is made explicit at every step: a prepared/
// awaiting_approval/approved proposal is always labelled as NOT YET
// DONE; only `confirmed` is ever described as something that actually
// happened - and since real execution stays disabled, this component
// will never show that state in production use. `execution_disabled` is
// shown as its own explained state, not folded into a generic error.
//
// Phase 5I, directive §5 added a "Modify" pathway (on awaiting_approval
// and approved) that pre-fills the editable form from the current
// proposal and, on resubmit, creates a genuinely new proposal with its
// own fresh approval fingerprint - the prior proposal's approval state
// is never reused against changed terms.
//
// OFFLINE AT THIS PHASE: not mounted into App.tsx's live navigation -
// see NheiPhase5Preview.tsx, which also wires Nova Invisible Load's
// "Get help with this" into this component's initial title (directive
// §7) - a single, explicitly chosen item, never a bulk conversion.

type CalendarActionPermission = { granted: boolean; grantedAt: string | null; withdrawnAt: string | null };

type ProposalState =
  | 'prepared' | 'awaiting_approval' | 'approved' | 'declined'
  | 'executing' | 'confirmed' | 'failed' | 'ambiguous' | 'undoing' | 'undone';

interface Proposal {
  proposalId: string;
  state: ProposalState;
  startIso: string;
  endIso: string;
  title: string;
  approvalFingerprint: string;
  failureReason: string | null;
  retryCount: number;
  externalEventId: string | null;
  // Phase 5J, directive §2 - supersedes/supersededBy. Only supersededBy
  // is actually read by this component (to show an honest "replaced"
  // state rather than re-offering a dead-end approve/execute action);
  // supersedes is carried through purely because the server's proposal
  // object includes it and TypeScript's structural typing does not
  // require naming every field a response happens to have, but it is
  // listed here for completeness/documentation.
  supersedes: string | null;
  supersededBy: string | null;
}

const STATE_LABEL: Record<ProposalState, string> = {
  prepared: 'Prepared - not yet shown for approval',
  awaiting_approval: 'Awaiting your approval - nothing has happened yet',
  approved: 'Approved - not yet applied',
  declined: 'Declined - nothing was changed',
  executing: 'Applying now...',
  confirmed: 'Applied to your calendar',
  failed: 'Could not be applied',
  ambiguous: 'Outcome unknown - needs manual review, not an automatic retry',
  undoing: 'Reversing...',
  undone: 'Reversed',
};

function formatWhen(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export const NovaTakeTheLoad = ({ initialTitle = '' }: { initialTitle?: string }) => {
  const [permission, setPermission] = useState<CalendarActionPermission | null>(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [history, setHistory] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executeOutcome, setExecuteOutcome] = useState<string | null>(null);
  const [outcomeRecorded, setOutcomeRecorded] = useState<string | null>(null);
  // Phase 5J, directive §2 - the id of the proposal Modify is replacing,
  // if any. Set only by requestModify, cleared on prepare (success or
  // failure) and on startOver - so a plain fresh "Prepare this proposal"
  // (never having clicked Modify) never accidentally supersedes anything.
  const [supersedingProposalId, setSupersedingProposalId] = useState<string | null>(null);

  // Phase 5H, directive §2 - fixed the two pre-existing
  // react-hooks/set-state-in-effect errors without changing behaviour.
  // "Adjust state during render" (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // replaces the old useEffect that mirrored `initialTitle` into `title`:
  // same effect (title updates exactly once whenever a NEW, non-empty
  // initialTitle arrives, e.g. from NovaProactiveSuggestions' handoff),
  // but computed synchronously during render instead of in a later effect.
  const [prevInitialTitle, setPrevInitialTitle] = useState(initialTitle);
  if (initialTitle !== prevInitialTitle) {
    setPrevInitialTitle(initialTitle);
    if (initialTitle) setTitle(initialTitle);
  }

  // The permission fetch-on-mount moved from a useCallback + a second
  // effect that merely called it (which is what the lint rule flagged)
  // to a single effect with its own inline async IIFE and an `ignore`
  // guard, so a response that resolves after this component has already
  // unmounted is never applied - same real request, same fallback on
  // failure, no behaviour change.
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await secureApiFetch('/api/nova/calendar-protection/action-permission');
        const body = await res.json();
        if (!ignore) setPermission(body.permission);
      } catch {
        if (!ignore) setPermission({ granted: false, grantedAt: null, withdrawnAt: null });
      }
    })();
    return () => { ignore = true; };
  }, []);

  const togglePermission = async () => {
    setPermissionBusy(true);
    try {
      const res = await secureApiFetch('/api/nova/calendar-protection/action-permission', {
        method: 'POST', data: { granted: !(permission?.granted ?? false) },
      });
      const body = await res.json();
      setPermission(body.permission);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not update this permission.');
    } finally {
      setPermissionBusy(false);
    }
  };

  const localToIso = (local: string): string => {
    if (!local) return '';
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  };

  // Inverse of localToIso, for pre-filling the form with an existing
  // proposal's own times (Phase 5I, directive §5's "Modify" pathway).
  // Builds the `datetime-local` input's expected local-time string
  // (no timezone suffix) from the local getters, not from the ISO
  // string's own UTC digits.
  const isoToLocalInputValue = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const propose = async () => {
    const startIso = localToIso(startLocal);
    const endIso = localToIso(endLocal);
    if (!title.trim() || !startIso || !endIso) {
      setError('A title and a real start and end time are required.');
      return;
    }
    setBusy(true);
    setError(null);
    setExecuteOutcome(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      // Phase 5J, directive §2 - when this prepare follows a Modify
      // click, supersedesProposalId tells the server to atomically mark
      // the ORIGINAL proposal as replaced, in the same transaction that
      // creates this new one - the actual server-authoritative fix for
      // the stale-approval flaw Phase 5I's client-only Modify left open
      // (the original proposal's own approval could otherwise still
      // authorise an execute, independently of this new one).
      const res = await secureApiFetch('/api/nova/calendar-protection/propose', {
        method: 'POST',
        data: {
          idempotencyKey, startIso, endIso, title: title.trim(),
          ...(supersedingProposalId ? { supersedesProposalId: supersedingProposalId } : {}),
        },
      });
      const body = await res.json();
      setProposal(body.proposal);
      setSupersedingProposalId(null);
    } catch (err) {
      if (err instanceof SecureApiError && err.message.startsWith('cannot_supersede:')) {
        // The original has moved on since this form was opened (executed,
        // already superseded by another tab, etc.) - an honest, specific
        // explanation rather than the raw server-internal error text.
        setError("This proposal could no longer be modified - it may have already been applied, undone, or replaced. Please start a new proposal.");
      } else {
        setError(err instanceof SecureApiError ? err.message : 'Could not prepare this proposal.');
      }
      setSupersedingProposalId(null);
    } finally {
      setBusy(false);
    }
  };

  const present = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      const res = await secureApiFetch(`/api/nova/calendar-protection/${proposal.proposalId}/present`, { method: 'POST' });
      const body = await res.json();
      setProposal(body.proposal);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not show this for approval.');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (approved: boolean) => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/calendar-protection/${proposal.proposalId}/approve`, {
        method: 'POST', data: { approved, approvalFingerprint: proposal.approvalFingerprint },
      });
      const outcome = await res.json();
      if (outcome.status === 'fingerprint_mismatch') {
        setError('This proposal changed since it was shown to you - please review it again.');
        return;
      }
      // Phase 5J, directive §2 - a Modify click against this exact
      // proposal landed in between it being shown and this decision
      // being recorded. Neither approving nor declining it means
      // anything any more - the replacement is the live one now.
      if (outcome.status === 'superseded') {
        setError('This proposal was replaced by a newer version before your decision was recorded - nothing was changed. Please review the newer version instead.');
        if (outcome.proposal) setProposal(outcome.proposal);
        return;
      }
      if (outcome.proposal) setProposal(outcome.proposal);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not record your decision.');
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/calendar-protection/${proposal.proposalId}/execute`, { method: 'POST' });
      const outcome = await res.json();
      setExecuteOutcome(outcome.status);
      if (outcome.proposal) setProposal(outcome.proposal);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not attempt to apply this.');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/calendar-protection/${proposal.proposalId}/retry`, { method: 'POST' });
      const body = await res.json();
      setProposal(body.proposal);
      setExecuteOutcome(null);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'This could not be retried.');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/calendar-protection/${proposal.proposalId}/undo`, { method: 'POST' });
      const body = await res.json();
      setProposal(body.proposal);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'This could not be undone.');
    } finally {
      setBusy(false);
    }
  };

  // Phase 5G, directive §8 — the same simple, optional, user-confirmed
  // outcome feedback Task Deferral already has (see NovaTaskDeferral.tsx's
  // own copy of this). Never required, never shown as anything but a
  // plain record of what happened; no causal claim is made either way.
  const recordOutcome = async (outcome: 'helped' | 'changed_plan' | 'not_used' | 'need_another_approach') => {
    if (!proposal) return;
    try {
      await secureApiFetch(`/api/nova/calendar-protection/${proposal.proposalId}/outcome`, { method: 'POST', data: { outcome } });
      setOutcomeRecorded(outcome);
    } catch {
      // Feedback is optional - a failed write here is not shown as an error.
    }
  };

  const loadHistory = async () => {
    try {
      const res = await secureApiFetch('/api/nova/calendar-protection/history');
      const body = await res.json();
      setHistory(body.proposals ?? []);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not load your history.');
    }
  };

  // Phase 5H, directive §3 — returning to saved progress. Reuses the
  // existing GET /:proposalId route (already there for the "current
  // proposal" screen itself) rather than inventing new storage: the
  // proposal was already real and server-persisted the moment it was
  // first prepared, this just loads that same record back into view.
  // Always an explicit click - never automatic/silent.
  const resumeProposal = async (proposalId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/calendar-protection/${proposalId}`);
      const body = await res.json();
      setProposal(body.proposal);
      setOutcomeRecorded(null);
      setExecuteOutcome(null);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not resume this.');
    } finally {
      setBusy(false);
    }
  };

  // Phase 5I, directive §5 — "Modify" re-opens the editable form,
  // pre-filled with this proposal's own title/start/end. Submitting it
  // calls `propose()` with a brand-new idempotencyKey AND (Phase 5J,
  // directive §2) this original proposal's own id as
  // `supersedesProposalId`, so the server atomically marks the original
  // as replaced - its own approval, even if still valid, can never again
  // authorise an execute/retry once that happens (see
  // nova-calendar-protection-service.ts's `supersededBy` field). The old
  // proposal's own `state` is left exactly as it truthfully was, still
  // visible in history - only now honestly marked as superseded too.
  const requestModify = () => {
    if (!proposal) return;
    setTitle(proposal.title);
    setStartLocal(isoToLocalInputValue(proposal.startIso));
    setEndLocal(isoToLocalInputValue(proposal.endIso));
    setSupersedingProposalId(proposal.proposalId);
    setProposal(null);
    setExecuteOutcome(null);
    setError(null);
  };

  const startOver = () => {
    setProposal(null);
    setExecuteOutcome(null);
    setError(null);
    setTitle('');
    setStartLocal('');
    setEndLocal('');
    setSupersedingProposalId(null);
  };

  return (
    <div className="card space-y-5 bg-background border border-border max-w-lg">
      <div>
        <h3 className="text-lg font-bold text-text-main flex items-center gap-2"><CalendarClock className="w-4 h-4 text-primary" /> Take the Load - Calendar Protection</h3>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Nova can prepare a specific calendar change for you to review and approve. Every step below calls a real
          server route - nothing is simulated. Real execution is turned off platform-wide right now, so even an
          approved change will not actually reach your calendar yet.
        </p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface/50">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {permission?.granted ? <ShieldCheck className="w-4 h-4 text-success" /> : <ShieldOff className="w-4 h-4 text-text-muted" />}
          Calendar action permission: <span className="font-bold text-text-main">{permission?.granted ? 'Granted' : 'Not granted'}</span>
        </div>
        <button onClick={togglePermission} disabled={permissionBusy} className="min-h-11 text-xs font-bold px-3 rounded-lg border border-border text-text-muted hover:text-text-main disabled:opacity-50">
          {permission?.granted ? 'Withdraw' : 'Grant'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</p>
      )}

      {!proposal && (
        <div className="space-y-2.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What should this protected time be called?"
            aria-label="Title for the protected time"
            className="w-full min-h-11 text-sm px-3 rounded-lg border border-border bg-surface text-text-main"
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              aria-label="Start time"
              className="flex-1 min-h-11 text-sm px-3 rounded-lg border border-border bg-surface text-text-main"
            />
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              aria-label="End time"
              className="flex-1 min-h-11 text-sm px-3 rounded-lg border border-border bg-surface text-text-main"
            />
          </div>
          <button onClick={propose} disabled={busy} className="btn-primary min-h-11 w-full justify-center disabled:opacity-50">
            Prepare this proposal
          </button>
        </div>
      )}

      {proposal && (
        <div className="space-y-3">
          <p className="text-sm text-text-main p-3 bg-surface/50 rounded-lg">
            "{proposal.title}" - {formatWhen(proposal.startIso)} to {formatWhen(proposal.endIso)}
          </p>
          <p className="text-[10px] text-text-muted uppercase tracking-wide font-bold">{STATE_LABEL[proposal.state]}</p>

          {/* Phase 5J, directive §2 - a proposal with supersededBy set has
              been replaced by a newer version via Modify. Its own state
              (e.g. "approved") stays truthful for history, but no action
              button is offered for it any more - the server would refuse
              every one of them anyway (see executeCalendarProtectionProposal/
              recordCalendarProtectionApproval/retryCalendarProtectionExecution's
              own supersededBy checks), so the UI does not pretend otherwise. */}
          {proposal.supersededBy && (
            <p className="text-xs text-text-muted flex items-start gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> This was replaced by a newer version - resume that one from your history instead.
            </p>
          )}

          {!proposal.supersededBy && proposal.state === 'prepared' && (
            <button onClick={present} disabled={busy} className="btn-primary min-h-11 px-4 text-xs disabled:opacity-50">
              Show for approval
            </button>
          )}

          {!proposal.supersededBy && proposal.state === 'awaiting_approval' && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => decide(true)} disabled={busy} className="btn-primary min-h-11 px-4 text-xs flex items-center gap-1.5 disabled:opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve exactly this
              </button>
              <button onClick={requestModify} disabled={busy} className="min-h-11 px-4 text-xs rounded-lg border border-border text-text-muted hover:text-text-main flex items-center gap-1.5 disabled:opacity-50">
                <Pencil className="w-3.5 h-3.5" /> Modify
              </button>
              <button onClick={() => decide(false)} disabled={busy} className="min-h-11 px-4 text-xs rounded-lg border border-border text-text-muted hover:text-text-main flex items-center gap-1.5 disabled:opacity-50">
                <XCircle className="w-3.5 h-3.5" /> Decline
              </button>
            </div>
          )}

          {proposal.state === 'declined' && (
            <p className="text-xs text-text-muted">You declined this - nothing was changed, and it is not re-offered automatically.</p>
          )}

          {!proposal.supersededBy && proposal.state === 'approved' && (
            <div className="flex flex-wrap gap-2">
              <button onClick={execute} disabled={busy} className="btn-primary min-h-11 px-4 text-xs disabled:opacity-50">
                Try to apply this
              </button>
              <button onClick={requestModify} disabled={busy} className="min-h-11 px-4 text-xs rounded-lg border border-border text-text-muted hover:text-text-main flex items-center gap-1.5 disabled:opacity-50">
                <Pencil className="w-3.5 h-3.5" /> Modify instead
              </button>
            </div>
          )}

          {executeOutcome === 'execution_disabled' && (
            <p className="text-xs text-text-muted flex items-start gap-1.5"><HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Real execution is turned off platform-wide right now - this was approved, but nothing was actually sent to your calendar.</p>
          )}
          {executeOutcome === 'approval_expired' && (
            <p className="text-xs text-amber-500">Your approval expired before this could be applied - please review and approve it again.</p>
          )}
          {executeOutcome === 'calendar_action_permission_required' && (
            <p className="text-xs text-destructive">Calendar action permission is no longer granted, so this could not be applied.</p>
          )}
          {executeOutcome === 'superseded' && (
            <p className="text-xs text-text-muted flex items-start gap-1.5"><HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> This proposal was replaced by a newer version before it could be applied - nothing was sent to your calendar.</p>
          )}

          {proposal.state === 'failed' && (
            <div className="space-y-2">
              <p className="text-xs text-destructive">{proposal.failureReason || 'This could not be applied.'}</p>
              {!proposal.supersededBy && (
                <button onClick={retry} disabled={busy} className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Try again
                </button>
              )}
            </div>
          )}

          {proposal.state === 'ambiguous' && (
            <p className="text-xs text-amber-500">We don't actually know whether this reached your calendar or not - it will not be retried automatically. Please check directly.</p>
          )}

          {proposal.state === 'confirmed' && (
            <div className="space-y-3">
              <p className="text-xs text-success flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> This was actually applied to your calendar.</p>
              <button onClick={undo} disabled={busy} className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5">
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </button>
              {!outcomeRecorded ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-text-muted flex items-center gap-1.5"><ThumbsUp className="w-3.5 h-3.5" /> Optional - how did this go?</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => recordOutcome('helped')} className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-text-muted hover:text-text-main">This helped</button>
                    <button onClick={() => recordOutcome('changed_plan')} className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-text-muted hover:text-text-main">I changed the plan</button>
                    <button onClick={() => recordOutcome('not_used')} className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-text-muted hover:text-text-main">I didn't use it</button>
                    <button onClick={() => recordOutcome('need_another_approach')} className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-text-muted hover:text-text-main">I need another approach</button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-text-muted italic">Thanks - noted.</p>
              )}
            </div>
          )}

          {proposal.state === 'undone' && (
            <p className="text-xs text-text-muted">Reversed - as if it had never happened.</p>
          )}

          <button onClick={startOver} className="text-[11px] text-text-muted/70 hover:text-text-muted underline">
            Start a new proposal
          </button>
        </div>
      )}

      <div className="pt-3 border-t border-border space-y-2">
        <button onClick={loadHistory} className="text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" /> Show my history
        </button>
        {history && (
          history.length === 0 ? (
            <p className="text-xs text-text-muted/70 italic">Nothing yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((p) => (
                <li key={p.proposalId} className="text-xs text-text-muted p-2 bg-surface/40 rounded-lg flex items-center justify-between gap-2">
                  <span>"{p.title}" - {STATE_LABEL[p.state]}</span>
                  <button onClick={() => resumeProposal(p.proposalId)} disabled={busy} className="shrink-0 min-h-8 px-2.5 text-xs font-bold text-primary hover:underline disabled:opacity-50">
                    Resume
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
};

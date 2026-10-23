import { useState } from 'react';
import { ListTodo, AlertTriangle, CheckCircle2, XCircle, RotateCcw, History, ShieldAlert, ThumbsUp, Pencil } from 'lucide-react';
import { secureApiFetch, SecureApiError } from '../lib/secure-api.ts';

// Nova Take the Load - Task Deferral UI (Phase 5F Agentic Expansion,
// directive §2). The second real, end-to-end Agentic Nova interface,
// built on nova-task-deferral-service.ts - every action here calls a
// real server.ts route; nothing is simulated except the final "apply"
// step, which always goes through the permanently mock-only connector
// (nova-task-deferral-connector-contract.ts) - no real Asana/Monday/Jira
// write ever happens, by design, not by a flag this phase will later flip.
//
// THE HARD SAFETY STEP (directive §2's "never automatically contact
// another person or assume that a user has authority to change someone
// else's commitments"): the control-clarification step below is not
// skippable, and answering "no" or "unsure" to either question ends the
// workflow at `requires_other_person` - there is no button anywhere in
// this component, at any later step, that can route around that.
//
// OFFLINE AT THIS PHASE: not mounted into App.tsx's live navigation - see
// NovaAgenticJourney.tsx / NheiPhase5Preview.tsx.

type ControlAnswer = 'yes' | 'no' | 'unsure';
type Priority = 'lower' | 'unchanged' | 'higher';
type ProposalState =
  | 'identified' | 'clarified' | 'requires_other_person' | 'prepared'
  | 'awaiting_approval' | 'approved' | 'declined' | 'executing' | 'confirmed' | 'failed';

interface Proposal {
  proposalId: string;
  state: ProposalState;
  identification: { taskDescription: string; currentDueDescription: string | null };
  controlClarification: { userControlsDeadline: ControlAnswer; userControlsOwnership: ControlAnswer } | null;
  postponementConsideration: { reasonablyPostponable: boolean; reasoning: string } | null;
  proposedChange: { proposedNewDueDescription: string | null; proposedNewPriority: Priority | null } | null;
  consequences: { consequences: string[]; uncertainties: string[] } | null;
  approvalFingerprint: string;
  failureReason: string | null;
  retryCount: number;
}

const STATE_LABEL: Record<ProposalState, string> = {
  identified: 'Task identified',
  clarified: 'Ready to prepare a proposal',
  requires_other_person: 'This needs that other person, not Nova',
  prepared: 'Prepared - not yet shown for approval',
  awaiting_approval: 'Awaiting your approval - nothing has happened yet',
  approved: 'Approved - not yet applied',
  declined: 'Declined - nothing was changed',
  executing: 'Applying now...',
  confirmed: 'Applied',
  failed: 'Could not be applied',
};

export const NovaTaskDeferral = ({ initialTaskDescription = '' }: { initialTaskDescription?: string }) => {
  const [taskDescription, setTaskDescription] = useState(initialTaskDescription);
  const [currentDueDescription, setCurrentDueDescription] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [deadlineAnswer, setDeadlineAnswer] = useState<ControlAnswer | ''>('');
  const [ownershipAnswer, setOwnershipAnswer] = useState<ControlAnswer | ''>('');
  const [reasonablyPostponable, setReasonablyPostponable] = useState(true);
  const [postponementReasoning, setPostponementReasoning] = useState('');
  const [changeKind, setChangeKind] = useState<'due' | 'priority'>('due');
  const [proposedDue, setProposedDue] = useState('');
  const [proposedPriority, setProposedPriority] = useState<Priority>('lower');
  const [consequencesText, setConsequencesText] = useState('');
  const [uncertaintiesText, setUncertaintiesText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executeOutcome, setExecuteOutcome] = useState<string | null>(null);
  const [outcomeRecorded, setOutcomeRecorded] = useState<string | null>(null);
  const [history, setHistory] = useState<Proposal[] | null>(null);

  const splitLines = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Directive §2 step 1 — identify the specific task.
  const identify = async () => {
    if (!taskDescription.trim()) {
      setError('Describe the task first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await secureApiFetch('/api/nova/task-deferral/identify', {
        method: 'POST',
        data: { idempotencyKey, taskDescription: taskDescription.trim(), currentDueDescription: currentDueDescription.trim() || null },
      });
      const body = await res.json();
      setProposal(body.proposal);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not identify this task.');
    } finally {
      setBusy(false);
    }
  };

  // Directive §2 step 2 — clarify control/ownership. This is the gate: a
  // "no" or "unsure" on either question ends the workflow right here.
  const clarify = async () => {
    if (!proposal || !deadlineAnswer || !ownershipAnswer) {
      setError('Answer both questions first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/clarify-control`, {
        method: 'POST', data: { userControlsDeadline: deadlineAnswer, userControlsOwnership: ownershipAnswer },
      });
      const outcome = await res.json();
      if (outcome.proposal) setProposal(outcome.proposal);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not record your answer.');
    } finally {
      setBusy(false);
    }
  };

  // Directive §2 steps 3-5 — consider postponement, propose the change,
  // explain consequences/uncertainties.
  const prepare = async () => {
    if (!proposal) return;
    const hasDue = changeKind === 'due' && proposedDue.trim().length > 0;
    const hasPriority = changeKind === 'priority';
    if (!hasDue && !hasPriority) {
      setError('Propose a new due date/time, or a new priority.');
      return;
    }
    if (!postponementReasoning.trim()) {
      setError('Say briefly why this can (or cannot) reasonably wait.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/prepare`, {
        method: 'POST',
        data: {
          reasonablyPostponable,
          postponementReasoning: postponementReasoning.trim(),
          proposedNewDueDescription: changeKind === 'due' ? proposedDue.trim() : null,
          proposedNewPriority: changeKind === 'priority' ? proposedPriority : null,
          consequences: splitLines(consequencesText),
          uncertainties: splitLines(uncertaintiesText),
        },
      });
      const body = await res.json();
      setProposal(body.proposal);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not prepare this proposal.');
    } finally {
      setBusy(false);
    }
  };

  const present = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/present`, { method: 'POST' });
      const body = await res.json();
      setProposal(body.proposal);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not show this for approval.');
    } finally {
      setBusy(false);
    }
  };

  // Directive §2 step 6 — approve, modify, or decline.
  const decide = async (approved: boolean) => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/approve`, {
        method: 'POST', data: { approved, approvalFingerprint: proposal.approvalFingerprint },
      });
      const outcome = await res.json();
      if (outcome.status === 'fingerprint_mismatch') {
        setError('This proposal changed since it was shown to you - please review it again.');
        return;
      }
      if (outcome.proposal) setProposal(outcome.proposal);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not record your decision.');
    } finally {
      setBusy(false);
    }
  };

  // "Modify" re-opens the prepare form against the same proposal - a
  // fresh call to /prepare computes a new fingerprint and clears any
  // prior approval, so the old decision can never be replayed against
  // changed terms.
  const requestModify = () => setProposal((p) => (p ? { ...p, state: 'clarified' } : p));

  const execute = async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/execute`, { method: 'POST' });
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
      const res = await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/retry`, { method: 'POST' });
      const body = await res.json();
      setProposal(body.proposal);
      setExecuteOutcome(null);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'This could not be retried.');
    } finally {
      setBusy(false);
    }
  };

  // Directive §7 — simple, optional, user-confirmed outcome feedback.
  // Never required, never shown as anything but a plain record of what
  // happened; no causal claim is made either way.
  const recordOutcome = async (outcome: 'helped' | 'changed_plan' | 'not_used' | 'need_another_approach') => {
    if (!proposal) return;
    try {
      await secureApiFetch(`/api/nova/task-deferral/${proposal.proposalId}/outcome`, { method: 'POST', data: { outcome } });
      setOutcomeRecorded(outcome);
    } catch {
      // Feedback is optional - a failed write here is not shown as an error.
    }
  };

  const loadHistory = async () => {
    try {
      const res = await secureApiFetch('/api/nova/task-deferral/history');
      const body = await res.json();
      setHistory(body.proposals ?? []);
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not load your history.');
    }
  };

  // Directive §2 step 8 — return to the task later.
  const startOver = () => {
    setProposal(null);
    setExecuteOutcome(null);
    setOutcomeRecorded(null);
    setError(null);
    setTaskDescription('');
    setCurrentDueDescription('');
    setDeadlineAnswer('');
    setOwnershipAnswer('');
    setPostponementReasoning('');
    setProposedDue('');
    setConsequencesText('');
    setUncertaintiesText('');
  };

  return (
    <div className="card space-y-5 bg-background border border-border max-w-lg">
      <div>
        <h3 className="text-lg font-bold text-text-main flex items-center gap-2"><ListTodo className="w-4 h-4 text-primary" /> Take the Load - Move a Task</h3>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Nova can help you work out whether a task can wait, and prepare a change for you to review. This only ever
          touches a mocked, practice task list here - nothing is sent to your real Asana, Monday, or Jira account.
        </p>
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</p>
      )}

      {!proposal && (
        <div className="space-y-2.5">
          <textarea
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="What's the task?"
            aria-label="Task description"
            rows={2}
            className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-surface text-text-main"
          />
          <input
            value={currentDueDescription}
            onChange={(e) => setCurrentDueDescription(e.target.value)}
            placeholder="When is it currently due, if you know? (optional)"
            aria-label="Current due date or priority"
            className="w-full min-h-11 text-sm px-3 rounded-lg border border-border bg-surface text-text-main"
          />
          <button onClick={identify} disabled={busy} className="btn-primary min-h-11 w-full justify-center disabled:opacity-50">
            Tell Nova about this task
          </button>
        </div>
      )}

      {proposal && (
        <div className="space-y-3">
          <p className="text-sm text-text-main p-3 bg-surface/50 rounded-lg">"{proposal.identification.taskDescription}"</p>
          <p className="text-[10px] text-text-muted uppercase tracking-wide font-bold">{STATE_LABEL[proposal.state]}</p>

          {(proposal.state === 'identified') && (
            <div className="space-y-3 p-3 rounded-lg border border-border bg-surface/40">
              <p className="text-xs text-text-main font-semibold">Before Nova proposes anything, two quick questions:</p>
              <div className="space-y-1.5">
                <p className="text-xs text-text-muted">Do you control when this is due?</p>
                <div className="flex gap-2">
                  {(['yes', 'no', 'unsure'] as ControlAnswer[]).map((a) => (
                    <button key={a} onClick={() => setDeadlineAnswer(a)} className={`min-h-9 px-3 text-xs rounded-lg border ${deadlineAnswer === a ? 'border-primary text-primary font-bold' : 'border-border text-text-muted'}`}>{a}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-text-muted">Is this task yours alone to move - no one else owns it with you?</p>
                <div className="flex gap-2">
                  {(['yes', 'no', 'unsure'] as ControlAnswer[]).map((a) => (
                    <button key={a} onClick={() => setOwnershipAnswer(a)} className={`min-h-9 px-3 text-xs rounded-lg border ${ownershipAnswer === a ? 'border-primary text-primary font-bold' : 'border-border text-text-muted'}`}>{a}</button>
                  ))}
                </div>
              </div>
              <button onClick={clarify} disabled={busy || !deadlineAnswer || !ownershipAnswer} className="btn-primary min-h-11 px-4 text-xs disabled:opacity-50">
                Continue
              </button>
            </div>
          )}

          {proposal.state === 'requires_other_person' && (
            <p className="text-xs text-text-main flex items-start gap-1.5 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
              This isn't something Nova can move for you - you said you don't control its deadline or you don't own it alone.
              The honest next step is asking whoever does, not a Nova proposal.
            </p>
          )}

          {proposal.state === 'clarified' && (
            <div className="space-y-3 p-3 rounded-lg border border-border bg-surface/40">
              <div className="flex items-center gap-2">
                <button onClick={() => setChangeKind('due')} className={`text-xs px-2 py-1 rounded border ${changeKind === 'due' ? 'border-primary text-primary' : 'border-border text-text-muted'}`}>Change the due date</button>
                <button onClick={() => setChangeKind('priority')} className={`text-xs px-2 py-1 rounded border ${changeKind === 'priority' ? 'border-primary text-primary' : 'border-border text-text-muted'}`}>Change the priority</button>
              </div>
              {changeKind === 'due' ? (
                <input value={proposedDue} onChange={(e) => setProposedDue(e.target.value)} placeholder="Proposed new due date, in your own words" aria-label="Proposed new due date" className="w-full min-h-11 text-sm px-3 rounded-lg border border-border bg-surface text-text-main" />
              ) : (
                <select value={proposedPriority} onChange={(e) => setProposedPriority(e.target.value as Priority)} aria-label="Proposed new priority" className="w-full min-h-11 text-sm px-3 rounded-lg border border-border bg-surface text-text-main">
                  <option value="lower">Lower priority</option>
                  <option value="unchanged">Leave priority unchanged</option>
                  <option value="higher">Higher priority</option>
                </select>
              )}
              <label className="flex items-center gap-2 text-xs text-text-muted">
                <input type="checkbox" checked={reasonablyPostponable} onChange={(e) => setReasonablyPostponable(e.target.checked)} />
                This can reasonably wait
              </label>
              <textarea value={postponementReasoning} onChange={(e) => setPostponementReasoning(e.target.value)} placeholder="Why (or why not)?" rows={2} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-surface text-text-main" />
              <textarea value={consequencesText} onChange={(e) => setConsequencesText(e.target.value)} placeholder="What would actually change if you did this? One per line." rows={2} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-surface text-text-main" />
              <textarea value={uncertaintiesText} onChange={(e) => setUncertaintiesText(e.target.value)} placeholder="Anything uncertain about this? One per line." rows={2} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-surface text-text-main" />
              <button onClick={prepare} disabled={busy} className="btn-primary min-h-11 px-4 text-xs disabled:opacity-50">Prepare this proposal</button>
            </div>
          )}

          {proposal.state === 'prepared' && proposal.proposedChange && (
            <div className="space-y-2 p-3 rounded-lg border border-border bg-surface/40">
              <p className="text-xs text-text-main">
                Proposal: {proposal.proposedChange.proposedNewDueDescription
                  ? `move the due date to "${proposal.proposedChange.proposedNewDueDescription}"`
                  : `set priority to ${proposal.proposedChange.proposedNewPriority}`}
              </p>
              {proposal.postponementConsideration && (
                <p className="text-xs text-text-muted">{proposal.postponementConsideration.reasoning}</p>
              )}
              {proposal.consequences && proposal.consequences.consequences.length > 0 && (
                <ul className="text-xs text-text-muted list-disc pl-4">{proposal.consequences.consequences.map((c, i) => <li key={i}>{c}</li>)}</ul>
              )}
              {proposal.consequences && proposal.consequences.uncertainties.length > 0 && (
                <ul className="text-xs text-amber-500 list-disc pl-4">{proposal.consequences.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul>
              )}
              <button onClick={present} disabled={busy} className="btn-primary min-h-11 px-4 text-xs disabled:opacity-50">Show for approval</button>
            </div>
          )}

          {proposal.state === 'awaiting_approval' && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => decide(true)} disabled={busy} className="btn-primary min-h-11 px-4 text-xs flex items-center gap-1.5 disabled:opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve exactly this
              </button>
              <button onClick={requestModify} disabled={busy} className="min-h-11 px-4 text-xs rounded-lg border border-border text-text-muted hover:text-text-main flex items-center gap-1.5">
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

          {proposal.state === 'approved' && (
            <button onClick={execute} disabled={busy} className="btn-primary min-h-11 px-4 text-xs disabled:opacity-50">Try to apply this</button>
          )}

          {executeOutcome === 'calendar_action_permission_required' && null}

          {proposal.state === 'failed' && (
            <div className="space-y-2">
              <p className="text-xs text-destructive">{proposal.failureReason || 'This could not be applied.'}</p>
              <button onClick={retry} disabled={busy} className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          )}

          {proposal.state === 'confirmed' && (
            <div className="space-y-3">
              <p className="text-xs text-success flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Done - applied to the mocked task list.</p>
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
                <li key={p.proposalId} className="text-xs text-text-muted p-2 bg-surface/40 rounded-lg">
                  "{p.identification.taskDescription}" - {STATE_LABEL[p.state]}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
};

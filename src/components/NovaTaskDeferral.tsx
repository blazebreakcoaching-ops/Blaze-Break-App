import { useState } from 'react';
import { ListTodo, AlertTriangle, CheckCircle2, XCircle, RotateCcw, History, ShieldAlert, ThumbsUp, Pencil, ListChecks, MessageSquareText, UserSearch, ArrowUpDown, Copy, Trash2 } from 'lucide-react';
import { secureApiFetch, SecureApiError } from '../lib/secure-api.ts';
import { buildMoreTimeMessageDraft, DECISION_MAKER_PROMPTS, ALTERNATIVE_PRIORITY_SUGGESTION, type NovaTaskDeferralSafeAssistanceChoice } from '../../nova-task-deferral-safe-assistance';

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
//
// Phase 5G (directive §4) wording audit: every state label and status
// message that can appear once a proposal reaches `executing`/`confirmed`/
// `failed` was re-read and corrected so it is legible completely out of
// context (e.g. a bare entry in the history list) - "Simulation
// completed - no real task was modified" / "Simulation could not be
// completed" / "Simulating now", never "Applied" on its own. A mock
// outcome is never described with the same words a real one would use.

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
  executing: 'Simulating now - no real task is being touched',
  // Phase 5G (directive §4): never say "Applied" on its own - this
  // category's connector is permanently mock-only (see
  // nova-task-deferral-connector-contract.ts's own header), so every
  // label here must be legible on its own, out of context (e.g. in the
  // history list below), never implying a real Asana/Monday/Jira task
  // was actually changed.
  confirmed: 'Simulation completed - no real task was modified',
  failed: 'Simulation could not be completed',
};

const SAFE_ASSISTANCE_LABEL: Record<NovaTaskDeferralSafeAssistanceChoice, string> = {
  break_into_steps: 'Break it into smaller steps',
  draft_more_time_message: 'Draft a message asking for more time',
  identify_decision_maker: "Help me think about who'd know",
  consider_alternative_priorities: 'Consider other priorities instead',
};

/**
 * Phase 5G (directive §5) - safe assistance for a task the user does not
 * control or own alone. Every choice here stays entirely on this screen:
 * no choice can reach `prepare`/`present`/`approve`/`execute` for THIS
 * proposal (there is no button in this panel that calls any of those),
 * and the message draft is never sent - only copied to the clipboard by
 * the user's own action, per nova-task-deferral-safe-assistance.ts's own
 * header.
 */
function SafeAssistancePanel({ taskDescription, currentDueDescription }: { taskDescription: string; currentDueDescription: string | null }) {
  const [active, setActive] = useState<NovaTaskDeferralSafeAssistanceChoice | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [stepDraft, setStepDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState(() => buildMoreTimeMessageDraft(taskDescription, currentDueDescription));
  const [copied, setCopied] = useState(false);
  const [decisionMakerNotes, setDecisionMakerNotes] = useState('');

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageDraft);
      setCopied(true);
    } catch {
      // Clipboard access can be denied by the browser - the text is still visible to select and copy by hand.
    }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-text-muted">Nova can still help with this, in ways that don't require moving the task yourself:</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(SAFE_ASSISTANCE_LABEL) as NovaTaskDeferralSafeAssistanceChoice[]).map((choice) => (
          <button
            key={choice}
            onClick={() => setActive((prev) => (prev === choice ? null : choice))}
            className={`min-h-10 px-3 text-xs font-bold rounded-lg border ${active === choice ? 'border-primary text-primary' : 'border-border text-text-muted hover:text-text-main'}`}
          >
            {SAFE_ASSISTANCE_LABEL[choice]}
          </button>
        ))}
      </div>

      {active === 'break_into_steps' && (
        <div className="p-3 rounded-lg border border-border bg-background space-y-2">
          <p className="text-[11px] text-text-muted flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" /> Your own steps - Nova doesn't generate these, and nothing here is saved if you leave.</p>
          {steps.map((step, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs text-text-main bg-surface/40 rounded-lg px-2.5 py-1.5">
              <span>{step}</span>
              <button onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Remove step: ${step}`} className="text-text-muted hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              placeholder="Add a step"
              aria-label="Add a breakdown step"
              className="flex-1 min-h-10 text-xs px-3 rounded-lg border border-border bg-surface text-text-main"
            />
            <button
              onClick={() => { if (stepDraft.trim()) { setSteps((prev) => [...prev, stepDraft.trim()]); setStepDraft(''); } }}
              aria-label="Add step"
              className="min-h-10 text-xs font-bold px-3 rounded-lg bg-primary/10 text-primary"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {active === 'draft_more_time_message' && (
        <div className="p-3 rounded-lg border border-border bg-background space-y-2">
          <p className="text-[11px] text-text-muted flex items-center gap-1.5"><MessageSquareText className="w-3.5 h-3.5" /> A starting draft, fully editable. Nothing here is ever sent automatically - copy it and send it yourself, however you'd normally reach this person.</p>
          <textarea
            value={messageDraft}
            onChange={(e) => setMessageDraft(e.target.value)}
            aria-label="Draft message asking for more time"
            rows={4}
            className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-surface text-text-main"
          />
          <button onClick={copyMessage} className="min-h-9 px-3 text-xs font-bold rounded-lg border border-border text-text-muted hover:text-text-main flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
        </div>
      )}

      {active === 'identify_decision_maker' && (
        <div className="p-3 rounded-lg border border-border bg-background space-y-2">
          <p className="text-[11px] text-text-muted flex items-center gap-1.5"><UserSearch className="w-3.5 h-3.5" /> A few questions to help you work out who'd actually know:</p>
          <ul className="text-xs text-text-main list-disc pl-4 space-y-1">
            {DECISION_MAKER_PROMPTS.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
          <textarea
            value={decisionMakerNotes}
            onChange={(e) => setDecisionMakerNotes(e.target.value)}
            placeholder="Your own notes (kept on this screen only)"
            aria-label="Notes on who the decision-maker might be"
            rows={2}
            className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-surface text-text-main"
          />
        </div>
      )}

      {active === 'consider_alternative_priorities' && (
        <p className="text-xs text-text-main p-3 rounded-lg border border-border bg-background flex items-start gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
          <span><span className="font-bold">{ALTERNATIVE_PRIORITY_SUGGESTION.tool}</span> - {ALTERNATIVE_PRIORITY_SUGGESTION.reason}</span>
        </p>
      )}
    </div>
  );
}

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
            <div className="space-y-2.5">
              <p className="text-xs text-text-main flex items-start gap-1.5 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                This isn't something Nova can move for you - you said you don't control its deadline or you don't own it alone.
                The honest next step is asking whoever does, not a Nova proposal.
              </p>
              <SafeAssistancePanel taskDescription={proposal.identification.taskDescription} currentDueDescription={proposal.identification.currentDueDescription} />
            </div>
          )}

          {proposal.state === 'clarified' && (
            <div className="space-y-3 p-3 rounded-lg border border-border bg-surface/40">
              <div className="flex items-center gap-2">
                <button onClick={() => setChangeKind('due')} className={`text-xs px-2 py-1 rounded border ${changeKind === 'due' ? 'border-primary text-primary' : 'border-border text-text-muted'}`}>Change the due date</button>
                <button onClick={() => setChangeKind('priority')} className={`text-xs px-2 py-1 rounded border ${changeKind === 'priority' ? 'border-primary text-primary' : 'border-border text-text-muted'}`}>Change the priority</button>
              </div>
              {changeKind === 'due' ? (
                <div className="space-y-1">
                  <input value={proposedDue} onChange={(e) => setProposedDue(e.target.value)} placeholder="Proposed new due date, in your own words" aria-label="Proposed new due date" className="w-full min-h-11 text-sm px-3 rounded-lg border border-border bg-surface text-text-main" />
                  {/* Phase 5G (directive §5): "handle due dates, time zones and
                      conflicting or incomplete task information explicitly" -
                      this is deliberately plain text, same as
                      NovaStatedPracticalProblem's own discipline, never
                      parsed or validated as a real calendar instant (that
                      is Calendar Protection's own, separate job, with its
                      own strict offset-qualified ISO validation). If a
                      time matters, naming the timezone here avoids the
                      exact "which 2:30pm did you mean" ambiguity a parsed
                      date could get wrong silently. */}
                  <p className="text-[11px] text-text-muted">If a specific time matters, say which timezone you mean - this is kept as your own words, never parsed as a calendar time.</p>
                </div>
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
            <button onClick={execute} disabled={busy} className="btn-primary min-h-11 px-4 text-xs disabled:opacity-50">Run the simulation</button>
          )}

          {executeOutcome === 'approval_expired' && (
            <p className="text-xs text-amber-500">Your approval expired before the simulation could run - please review and approve it again.</p>
          )}
          {executeOutcome === 'already_executing' && (
            <p className="text-xs text-text-muted">This is already being simulated from another attempt - please wait a moment and check again.</p>
          )}

          {proposal.state === 'failed' && (
            <div className="space-y-2">
              <p className="text-xs text-destructive">{proposal.failureReason || 'The simulation could not be completed.'} No real task was touched.</p>
              <button onClick={retry} disabled={busy} className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          )}

          {proposal.state === 'confirmed' && (
            <div className="space-y-3">
              <p className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Simulation completed. The proposed change was saved to a practice task list only -
                no real Asana, Monday, or Jira task was modified.
              </p>
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

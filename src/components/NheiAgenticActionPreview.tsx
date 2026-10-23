import { useState } from 'react';
import { Calendar, ArrowRight, Undo2, CheckCircle2, XCircle } from 'lucide-react';
import {
  proposeAgenticAction, presentForApproval, recordApprovalDecision, beginExecution,
  recordExecutionOutcome, undoAction, type NheiAgenticActionProposal,
} from '../../nhei-agentic-action-contract';

// NHEI PHASE 5 - Agentic action permission preview (directive §8).
//
// A SYNTHETIC-ONLY demonstration of how a recovery recommendation could,
// in a future phase, become an approved calendar adjustment - walking
// through every real state in nhei-agentic-action-contract.ts.
// "Execution" and "connector" here are both simulated with a timeout,
// never a real calendar/task API call, never a real external action.
// No automatic messaging, calendar modification, or Guardian
// communication happens anywhere in this component.
//
// OFFLINE AT THIS PHASE: not mounted into App.tsx's live navigation.

export const NheiAgenticActionPreview = () => {
  const [proposal, setProposal] = useState<NheiAgenticActionProposal | null>(null);
  const [simulating, setSimulating] = useState(false);

  const start = () => {
    const p = proposeAgenticAction({
      sourceSuggestionId: 'reset_studio_1',
      connector: 'calendar',
      proposedChangeDescription: 'Block 30 minutes tomorrow at 2:00pm, titled "Reset Studio".',
      undoSupported: true,
    });
    setProposal(presentForApproval(p));
  };

  const approve = (approved: boolean) => {
    if (!proposal) return;
    const next = recordApprovalDecision(proposal, approved);
    setProposal(next);
    if (approved) {
      setSimulating(true);
      const executing = beginExecution(next);
      setProposal(executing);
      // Simulated connector delay only - no real API call of any kind.
      setTimeout(() => {
        setProposal(recordExecutionOutcome(executing, 'confirmed'));
        setSimulating(false);
      }, 900);
    }
  };

  const undo = () => {
    if (!proposal) return;
    setProposal(undoAction(proposal));
  };

  return (
    <div className="card space-y-4 bg-background border border-border max-w-lg">
      <div>
        <h3 className="text-lg font-bold text-text-main flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Agentic action - synthetic preview</h3>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Nothing here calls a real calendar, task app, or any other connector - this is a worked example of the
          approval contract a future phase would need, not a working integration.
        </p>
      </div>

      {!proposal && (
        <button onClick={start} className="btn-primary py-2.5 px-4 text-xs">
          Show a worked example
        </button>
      )}

      {proposal && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">Proposed change (from your Reset Studio suggestion):</p>
          <p className="text-sm text-text-main p-3 bg-surface/50 rounded-lg">{proposal.proposedChangeDescription}</p>
          <p className="text-[10px] text-text-muted uppercase tracking-wide font-bold">State: {proposal.state}</p>

          {proposal.state === 'awaiting_approval' && (
            <div className="flex gap-2">
              <button onClick={() => approve(true)} className="btn-primary py-2.5 px-4 text-xs flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5" /> Approve
              </button>
              <button onClick={() => approve(false)} className="py-2.5 px-4 text-xs rounded-lg border border-border text-text-muted hover:text-text-main flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" /> Decline
              </button>
            </div>
          )}

          {proposal.state === 'declined' && (
            <p className="text-xs text-text-muted">You declined this - nothing was changed anywhere, and this isn't re-offered automatically.</p>
          )}

          {(proposal.state === 'executing' || simulating) && (
            <p className="text-xs text-text-muted">Simulating the connector...</p>
          )}

          {proposal.state === 'confirmed' && (
            <div className="space-y-2">
              <p className="text-xs text-success flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Simulated: confirmed by the (fake) connector.</p>
              <button onClick={undo} className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5">
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </button>
            </div>
          )}

          {proposal.state === 'undone' && (
            <p className="text-xs text-text-muted">Undone - reversed, as if it had never happened.</p>
          )}

          {proposal.state === 'failed' && (
            <p className="text-xs text-destructive">Simulated failure - never auto-retried.</p>
          )}
        </div>
      )}
    </div>
  );
};

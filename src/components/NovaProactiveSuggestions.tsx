import { useState } from 'react';
import { Lightbulb, Info, ShieldQuestion, ArrowRightCircle, Ban, Pencil, X } from 'lucide-react';
import { secureApiFetch, SecureApiError } from '../lib/secure-api.ts';
import type { NovaStatedPracticalProblem } from '../../nova-take-the-load-types';

// Nova Proactive Suggestions UI (Phase 5G, directive §2).
//
// The real customer-facing interface for `generateProactiveSuggestions`/
// `POST /api/nova/proactive-suggestions` (Phase 5F, directive §5), which
// previously had no UI calling it at all. Every suggestion rendered here
// is the server's own, real response - this component never generates a
// suggestion itself, and the two real authorisation checks
// (allowCalendarActions, a connected task-provider token) are performed
// server-side, never assumed here.
//
// ACCEPT / EDIT / DISMISS / IGNORE (directive §2's own words):
//  - Accept ("Use this"): hands the (possibly edited) text straight to
//    the real Calendar Protection or Task Deferral flow via this
//    component's own callback props - it does NOT prepare, approve, or
//    execute anything itself. "Do not create another independent
//    approval engine": there is no state machine in this file at all,
//    only a fetch and a list render.
//  - Edit: a per-suggestion "Edit before using" toggle reveals a plain
//    textarea seeded with the current text; the edited text, not the
//    server's original wording, is what gets handed to the real flow.
//  - Dismiss: removes one suggestion from view, locally, by id - never
//    sent anywhere, never recorded as a rejection of anything.
//  - Ignore: the default - closing this panel or navigating away
//    without choosing anything is always available and does nothing.
//
// "A connected integration is not equivalent to consent to modify it"
// (directive §2): every suggestion's own `requiresPermissionOrIntegration`
// text makes this explicit (see nova-proactive-assistance-contract.ts),
// and accepting a suggestion here only ever PRE-FILLS the real Calendar
// Protection/Task Deferral screen - the user must still separately
// approve a concrete proposal there before anything is prepared, let
// alone executed. Nothing here can skip that.

type Category = 'calendar_protection' | 'task_deferral';

interface Suggestion {
  suggestionId: string;
  category: Category;
  description: string;
  basedOn: string[];
  whyItMightHelp: string;
  requiresPermissionOrIntegration: string;
  whatHappensIfYouProceed: string;
  whatNovaCannotDoYet: string;
}

export const NovaProactiveSuggestions = ({
  initialObligationOrGoal = '',
  capacityBand = null,
  onUseForCalendarProtection,
  onUseForTaskDeferral,
}: {
  initialObligationOrGoal?: string;
  capacityBand?: NovaStatedPracticalProblem['capacityBand'];
  onUseForCalendarProtection: (description: string) => void;
  onUseForTaskDeferral: (description: string) => void;
}) => {
  const [obligationOrGoal, setObligationOrGoal] = useState(initialObligationOrGoal);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch('/api/nova/proactive-suggestions', {
        method: 'POST',
        data: {
          statedGoal: null,
          voluntarilySharedObligation: obligationOrGoal.trim() || null,
          capacityBand,
          priorUserConfirmedPlan: null,
        },
      });
      const body = await res.json();
      setSuggestions(body.suggestions ?? []);
      setDismissed(new Set());
    } catch (err) {
      setError(err instanceof SecureApiError ? err.message : 'Could not load suggestions.');
    } finally {
      setBusy(false);
    }
  };

  const use = (s: Suggestion) => {
    const text = (editingId === s.suggestionId ? editDraft : obligationOrGoal).trim() || obligationOrGoal;
    if (s.category === 'calendar_protection') onUseForCalendarProtection(text);
    else onUseForTaskDeferral(text);
  };

  const visible = (suggestions ?? []).filter((s) => !dismissed.has(s.suggestionId));

  return (
    <div className="card space-y-4 bg-background border border-border max-w-lg">
      <div>
        <h3 className="text-lg font-bold text-text-main flex items-center gap-2"><Lightbulb className="w-4 h-4 text-primary" /> Proactive Options</h3>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Nova can suggest a possible next step based on what you tell it here, your stated capacity, and permissions/
          integrations you've already set up. This is only ever a suggestion - nothing is prepared or changed until
          you choose one and review it in the real screen it leads to.
        </p>
      </div>

      <textarea
        value={obligationOrGoal}
        onChange={(e) => setObligationOrGoal(e.target.value)}
        placeholder="What's the obligation or goal? (your own words)"
        aria-label="Obligation or goal for proactive suggestions"
        rows={2}
        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-surface text-text-main"
      />
      <button onClick={fetchSuggestions} disabled={busy} className="btn-primary min-h-11 w-full justify-center disabled:opacity-50">
        {busy ? 'Checking...' : 'See what Nova can suggest'}
      </button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {suggestions !== null && visible.length === 0 && (
        <p className="text-xs text-text-muted/70 italic">Nothing to suggest right now - that's fine, you can still go straight to Calendar Protection or Task Deferral yourself.</p>
      )}

      <div className="space-y-3">
        {visible.map((s) => (
          <div key={s.suggestionId} className="p-3 rounded-lg border border-border bg-surface/40 space-y-2">
            <p className="text-sm text-text-main font-semibold">{s.description}</p>
            <p className="text-xs text-text-muted">Based on: {s.basedOn.join('; ')}</p>
            <p className="text-xs text-text-muted flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Why this might help: {s.whyItMightHelp}</p>
            <p className="text-xs text-text-muted flex items-start gap-1.5"><ShieldQuestion className="w-3.5 h-3.5 shrink-0 mt-0.5" /> What's required: {s.requiresPermissionOrIntegration}</p>
            <p className="text-xs text-text-muted flex items-start gap-1.5"><ArrowRightCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> If you proceed: {s.whatHappensIfYouProceed}</p>
            <p className="text-xs text-amber-500 flex items-start gap-1.5"><Ban className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Nova can't yet: {s.whatNovaCannotDoYet}</p>

            {editingId === s.suggestionId && (
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                aria-label={`Edit before using: ${s.description}`}
                rows={2}
                className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-text-main"
              />
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => use(s)} className="min-h-9 px-3 text-xs font-bold rounded-lg bg-primary/10 text-primary">
                Use this
              </button>
              <button
                onClick={() => {
                  if (editingId === s.suggestionId) { setEditingId(null); return; }
                  setEditingId(s.suggestionId);
                  setEditDraft(obligationOrGoal);
                }}
                className="min-h-9 px-3 text-xs font-bold rounded-lg border border-border text-text-muted hover:text-text-main flex items-center gap-1"
              >
                <Pencil className="w-3.5 h-3.5" /> {editingId === s.suggestionId ? 'Stop editing' : 'Edit before using'}
              </button>
              <button
                onClick={() => setDismissed((prev) => new Set(prev).add(s.suggestionId))}
                className="min-h-9 px-3 text-xs font-bold rounded-lg border border-border text-text-muted hover:text-text-main flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

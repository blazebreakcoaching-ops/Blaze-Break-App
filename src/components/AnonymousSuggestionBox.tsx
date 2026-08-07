import React, { useState } from 'react';
import { MessageSquareText, Loader2, CheckCircle2 } from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';

export const AnonymousSuggestionBox = ({ orgId, organisationName }: { orgId: string; organisationName?: string }) => {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim() || !orgId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await secureApiFetch(`/api/org/${orgId}/suggestions`, {
        method: 'POST',
        data: { message: message.trim() },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Could not submit that.');
      } else {
        setMessage('');
        setJustSubmitted(true);
        setTimeout(() => setJustSubmitted(false), 4000);
      }
    } catch (e) {
      setError('Could not submit that.');
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
          <MessageSquareText className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-text-main">Anonymous Suggestion</h4>
          <p className="text-xs text-text-muted">
            Tell {organisationName || 'your organisation'} what's actually making work harder, or what would genuinely help. This is submitted with no name, no account link, nothing traceable back to you — structurally, not just by policy.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-2.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg">{error}</div>
      )}

      {justSubmitted ? (
        <div className="p-4 bg-success/5 border border-success/20 rounded-xl flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="w-4 h-4" /> Sent — thanks for sharing this.
        </div>
      ) : (
        <>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's one thing that would genuinely make things better?"
            maxLength={500}
            className="w-full h-20 bg-surface border border-border rounded-xl p-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary resize-none"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !message.trim()}
            className="px-4 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Submit Anonymously
          </button>
        </>
      )}
    </div>
  );
};

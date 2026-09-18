import { useState } from 'react';
import { Star, MessageSquare, Bug, Lightbulb, Quote } from 'lucide-react';
import { cn } from '../lib/utils';
import { secureApiFetch } from '../lib/secure-api';

type FeedbackCategory = 'general' | 'bug' | 'feature_request' | 'testimonial';

const CATEGORIES: { id: FeedbackCategory; label: string; desc: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General Feedback', desc: 'Anything on your mind about the app', icon: MessageSquare },
  { id: 'bug', label: 'Bug Report', desc: 'Something broken or not working right', icon: Bug },
  { id: 'feature_request', label: 'Feature Request', desc: 'Something you wish the app could do', icon: Lightbulb },
  { id: 'testimonial', label: 'Testimonial', desc: 'A story or quote about your experience', icon: Quote },
];

// A general-purpose feedback + testimonial submission form - deliberately
// separate from NovaFeedbackModal.tsx, which is a self-triggering, weekly,
// Nova-specific pulse check. This one is user-initiated only (reached via
// Settings), persists server-side, and is reviewed privately by the app's
// owner - nothing submitted here is ever shown to other users or displayed
// publicly anywhere in the app on its own.
export const FeedbackForm = () => {
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [publicUseConsent, setPublicUseConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');

  const showRating = category === 'general' || category === 'testimonial';

  const reset = () => {
    setMessage('');
    setRating(0);
    setPublicUseConsent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || status === 'submitting') return;

    setStatus('submitting');
    try {
      const res = await secureApiFetch('/api/feedback/submit', {
        method: 'POST',
        data: {
          category,
          message: message.trim(),
          rating: showRating && rating > 0 ? rating : undefined,
          publicUseConsent: category === 'testimonial' ? publicUseConsent : false,
        },
      });
      if (!res.ok) throw new Error('Submission failed');

      setStatus('sent');
      reset();
    } catch (err) {
      console.error('Failed to submit feedback', err);
      setStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-xl font-display font-bold text-text-main">Feedback &amp; Testimonials</h3>
        <p className="text-xs text-text-muted">Tell Tourae what's working, what isn't, or share a story about your experience. Submissions are reviewed privately.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const selected = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setCategory(c.id); setStatus('idle'); }}
                aria-pressed={selected}
                className={cn(
                  'text-left p-3.5 rounded-xl border transition-all flex items-start gap-3',
                  selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                )}
              >
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', selected ? 'text-primary' : 'text-text-muted')} aria-hidden="true" />
                <span>
                  <span className={cn('block text-sm font-bold', selected ? 'text-primary' : 'text-text-main')}>{c.label}</span>
                  <span className="block text-xs text-text-muted mt-0.5">{c.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        {showRating && (
          <div className="space-y-2">
            <label className="text-xs font-black text-text-main uppercase tracking-widest block">Optional Rating</label>
            <div className="flex items-center gap-1 bg-surface dark:bg-card border border-border p-3 rounded-xl shadow-inner w-fit">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(rating === star ? 0 : star)}
                  aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                  aria-pressed={rating >= star}
                  className={cn(
                    'p-1.5 rounded-lg transition-all',
                    rating >= star ? 'text-[#9a3412] dark:text-warning' : 'text-text-muted hover:text-warning/50'
                  )}
                >
                  <Star className={cn('w-5 h-5', rating >= star && 'fill-current')} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="feedback-message" className="text-xs font-black text-text-main uppercase tracking-widest block">
            {category === 'testimonial' ? 'Your Story' : 'Message'}
          </label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={2000}
            placeholder={category === 'testimonial' ? 'Share what using Blaze Break has been like for you...' : 'Tell us what\'s on your mind...'}
            className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors min-h-[120px] resize-none"
          />
        </div>

        {category === 'testimonial' && (
          <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-surface dark:bg-card cursor-pointer">
            <input
              type="checkbox"
              checked={publicUseConsent}
              onChange={(e) => setPublicUseConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary shrink-0"
            />
            <span className="text-xs text-text-muted leading-relaxed">
              You're welcome to submit this as a testimonial. Ticking this box means Tourae <strong className="text-text-main">may</strong> use this quote elsewhere (for example on the website) with your permission — it does <strong className="text-text-main">not</strong> publish anything automatically, and nothing here becomes visible to other users. It's reviewed privately first.
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={!message.trim() || status === 'submitting'}
          className="w-full btn-primary py-3 rounded-xl flex items-center justify-center gap-2 font-bold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'submitting' ? 'Sending...' : 'Submit'}
        </button>

        {status === 'sent' && (
          <p role="status" className="text-xs font-semibold text-success dark:text-[#4ade80]">
            Thank you — this has been sent to Tourae directly.
          </p>
        )}
        {status === 'error' && (
          <p role="alert" className="text-xs font-semibold text-destructive dark:text-[#f87171]">
            Couldn't send that just now. You can also email us directly at support@blazebreak.com
          </p>
        )}
      </form>
    </div>
  );
};

export default FeedbackForm;

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartPulse, Loader2, AlertTriangle, CheckCircle2, Zap, Award, Activity, Send, Target, MessageCircle, HeartHandshake, Clock3, HandHeart } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { secureApiFetch } from '../lib/secure-api';

interface SharedGoal {
  id: string;
  text: string;
  category: string;
  completedToday: boolean;
  streak: number;
}

interface AllyData {
  allyName: string;
  sharedGoals?: SharedGoal[];
  longestStreak?: number;
  recentAvgMood?: number | null;
  supportPreferences?: { helps: string; doesNotHelp: string };
  consentStatus?: 'pending' | 'accepted' | 'declined';
  expired?: boolean;
}

export const AllyView = ({ token }: { token: string }) => {
  const { loading: authLoading } = useAuth();
  const [data, setData] = useState<AllyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');

  // "Maybe Later" is deliberately local-only - nothing is recorded, since
  // there's nothing to record yet. Reopening the link later asks again.
  const [deferred, setDeferred] = useState(false);
  const [respondingTo, setRespondingTo] = useState<'accept' | 'decline' | null>(null);
  const [consentError, setConsentError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      try {
        const res = await secureApiFetch(`/api/ally/view/${token}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "This link isn't valid.");
        } else {
          setData(json);
        }
      } catch (e) {
        setError("Couldn't load this page. Please check your connection and try again.");
      }
      setLoading(false);
    };
    load();
  }, [authLoading, token]);

  // Mandatory Ally Consent (Master Support Circle spec): the ally's own
  // active choice - never implied by having opened the link.
  const respondToConsent = async (decision: 'accept' | 'decline') => {
    setRespondingTo(decision);
    setConsentError('');
    try {
      const res = await secureApiFetch(`/api/ally/view/${token}/consent`, {
        method: 'POST',
        data: { decision },
      });
      const json = await res.json();
      if (!res.ok) {
        setConsentError(json.error || "Could not record that - please try again.");
      } else {
        setData((prev) => (prev ? { ...prev, consentStatus: json.consentStatus } : prev));
        if (json.consentStatus === 'accepted') {
          // Reload so an acceptance immediately shows the real data this
          // same response never included while still pending.
          const reload = await secureApiFetch(`/api/ally/view/${token}`);
          const reloadJson = await reload.json();
          if (reload.ok) setData(reloadJson);
        }
      }
    } catch (e) {
      setConsentError("Could not record that - please try again.");
    }
    setRespondingTo(null);
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const res = await secureApiFetch(`/api/ally/view/${token}/encourage`, {
        method: 'POST',
        data: { message: message.trim() },
      });
      const json = await res.json();
      if (!res.ok) {
        setSendError(json.error || 'Could not send that.');
      } else {
        setSent(true);
        setMessage('');
      }
    } catch (e) {
      setSendError('Could not send that.');
    }
    setSending(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-10 h-10 mx-auto text-text-muted" />
          <h1 className="text-xl font-bold text-text-main">Link Not Valid</h1>
          <p className="text-sm text-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (data?.expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <Clock3 className="w-10 h-10 mx-auto text-text-muted" />
          <h1 className="text-xl font-bold text-text-main">This Invitation Has Expired</h1>
          <p className="text-sm text-text-muted">Ask {data.allyName || 'them'} to send you a new link.</p>
        </div>
      </div>
    );
  }

  if (data?.consentStatus === 'declined') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <HandHeart className="w-10 h-10 mx-auto text-text-muted" />
          <h1 className="text-xl font-bold text-text-main">You've Let Them Know</h1>
          <p className="text-sm text-text-muted">You said you couldn't take this on right now. Nothing further is shared with you here.</p>
        </div>
      </div>
    );
  }

  // Mandatory Ally Consent (Master Support Circle spec): nothing below
  // this point - no shared goals, mood, support preferences - is ever
  // reachable until the ally actively accepts. "Maybe Later" is a purely
  // local dismissal: nothing is recorded, so reopening the link later
  // asks again, exactly as if this visit hadn't happened.
  if (data?.consentStatus === 'pending' && !deferred) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto">
            <HeartPulse className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-text-main">{data.allyName || 'Someone'} Wants You in Their Corner</h1>
            <p className="text-sm text-text-muted leading-relaxed">
              They've asked you to be their Recovery Ally - someone they can share a little progress with and lean on for everyday encouragement. You're not expected to diagnose, monitor, or fix anything, and you can step back at any time.
            </p>
          </div>
          {consentError && (
            <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl text-left">{consentError}</div>
          )}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => respondToConsent('accept')}
              disabled={respondingTo !== null}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
            >
              {respondingTo === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} I'm Happy to Help
            </button>
            <button
              onClick={() => respondToConsent('decline')}
              disabled={respondingTo !== null}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-surface border border-border text-text-main text-xs font-bold uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50"
            >
              {respondingTo === 'decline' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} I Can't Take This On Right Now
            </button>
            <button
              onClick={() => setDeferred(true)}
              disabled={respondingTo !== null}
              className="text-xs text-text-muted hover:text-text-main underline underline-offset-2 disabled:opacity-50"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (deferred) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <Clock3 className="w-10 h-10 mx-auto text-text-muted" />
          <h1 className="text-xl font-bold text-text-main">No Problem</h1>
          <p className="text-sm text-text-muted">You can decide any time by reopening this link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto">
            <HeartPulse className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-display font-medium text-text-main tracking-tight">
            You're someone's Recovery Ally
          </h1>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            They've chosen to share this with you as part of their burnout recovery work on Blaze Break. No account needed — just take a look, and leave them a note if you'd like.
          </p>
        </div>

        {data?.sharedGoals && (
          <div className="card space-y-4">
            <h2 className="font-bold text-text-main flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Their Boundary Goals</h2>
            {data.sharedGoals.length === 0 ? (
              <p className="text-sm text-text-muted">No goals shared yet.</p>
            ) : (
              <div className="space-y-2">
                {data.sharedGoals.map(goal => (
                  <div key={goal.id} className={`flex items-center justify-between p-3 rounded-xl border ${goal.completedToday ? 'bg-success/5 border-success/20' : 'bg-surface border-border'}`}>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className={`w-4 h-4 ${goal.completedToday ? 'text-success dark:text-[#4ade80]' : 'text-text-muted'}`} />
                      <span className="text-sm font-medium text-text-main">{goal.text}</span>
                    </div>
                    {goal.streak > 0 && (
                      <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-warning flex items-center gap-1 shrink-0">
                        <Zap className="w-3 h-3" /> {goal.streak} day{goal.streak === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {typeof data?.longestStreak === 'number' && (
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-main">Longest current streak: {data.longestStreak} day{data.longestStreak === 1 ? '' : 's'}</p>
              <p className="text-xs text-text-muted">Across all their shared goals.</p>
            </div>
          </div>
        )}

        {typeof data?.recentAvgMood === 'number' && (
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-main">Recent average mood: {data.recentAvgMood}/10</p>
              <p className="text-xs text-text-muted">Based on the last week of check-ins.</p>
            </div>
          </div>
        )}

        {data?.supportPreferences && (data.supportPreferences.helps || data.supportPreferences.doesNotHelp) && (
          <div className="card space-y-3">
            <h2 className="font-bold text-text-main flex items-center gap-2"><MessageCircle className="w-4 h-4 text-primary" /> How to Support Me</h2>
            {data.supportPreferences.helps && (
              <p className="text-sm text-text-main"><strong>Helps:</strong> {data.supportPreferences.helps}</p>
            )}
            {data.supportPreferences.doesNotHelp && (
              <p className="text-sm text-text-main"><strong>Doesn't help:</strong> {data.supportPreferences.doesNotHelp}</p>
            )}
          </div>
        )}

        <div className="card space-y-3 bg-surface">
          <h2 className="font-bold text-text-main flex items-center gap-2"><HeartHandshake className="w-4 h-4 text-primary" /> A Couple of Things</h2>
          <ul className="text-xs text-text-muted space-y-1.5 leading-relaxed">
            <li>You're not expected to diagnose, monitor, or fix anything.</li>
            <li>You can pause notifications or step back at any time, no explanation required.</li>
            <li>This isn't a crisis service - if you're worried about their safety right now, reach out directly or contact emergency services.</li>
          </ul>
        </div>

        <div className="card space-y-4">
          <h2 className="font-bold text-text-main">Leave Them a Note</h2>
          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div key="sent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-success/5 border border-success/20 rounded-xl flex items-center gap-2 text-sm text-success dark:text-[#4ade80]">
                <CheckCircle2 className="w-4 h-4" /> Sent — it'll show up in their encouragement feed.
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                {sendError && (
                  <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive dark:text-[#f87171] text-xs rounded-xl">{sendError}</div>
                )}
                <textarea
                  aria-label="Your encouragement note"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="You're doing great — proud of you for sticking with this."
                  maxLength={300}
                  className="w-full h-24 bg-surface border border-border rounded-xl p-4 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary resize-none"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-text-muted">
          This isn't a crisis service. If you're worried about someone's safety, please reach out directly or contact emergency services.
        </p>
      </div>
    </div>
  );
};

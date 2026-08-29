import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartPulse, Loader2, AlertTriangle, CheckCircle2, Zap, Award, Activity, Send, Target } from 'lucide-react';
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

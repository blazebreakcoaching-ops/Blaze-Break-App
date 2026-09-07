import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { secureApiFetch } from '../lib/secure-api';

interface BlendEntry {
  profile: string;
  percentage: number;
}

interface BlendResponse {
  blend: BlendEntry[] | null;
  driftNotes: string[];
  hasQuizBaseline: boolean;
  hasCalendarSignal: boolean;
  hasSlackSignal: boolean;
  note?: string;
}

export const ArchetypeBlend = () => {
  const [data, setData] = useState<BlendResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBlend = async () => {
    try {
      const res = await secureApiFetch('/api/signals/blend');
      const json = await res.json();
      setData(json);
    } catch (e) {
      // Leave data as-is — the card just shows its last known state or the loading skeleton.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlend();
  }, []);

  return (
    <div className="card bg-card border border-border p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-text-main text-sm">Your Blend</h4>
            <p className="text-[10px] text-text-muted uppercase tracking-widest">Evolving, not fixed</p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchBlend(); }}
          aria-label={loading ? "Refreshing your blend" : "Refresh your blend"}
          className="p-2 rounded-full text-text-muted hover:text-primary hover:bg-surface transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} aria-hidden="true" />
        </button>
      </div>

      {loading && !data ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-2 bg-surface rounded-full w-full" />
          <div className="h-2 bg-surface rounded-full w-3/4" />
        </div>
      ) : !data?.hasQuizBaseline ? (
        <p className="text-xs text-text-muted">
          {data?.note || "Complete the burnout diagnostic to see your blend."}
        </p>
      ) : (
        <>
          <div className="space-y-2.5" role="status" aria-live="polite" aria-atomic="true">
            {(data.blend || []).map((b, i) => (
              <motion.div
                key={b.profile}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3"
              >
                <span className={cn(
                  "text-xs font-bold w-10 text-right shrink-0",
                  i === 0 ? "text-[#9a3412] dark:text-primary" : "text-text-muted"
                )}>
                  {b.percentage}%
                </span>
                <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", i === 0 ? "bg-primary" : "bg-text-muted/40")}
                    style={{ width: `${b.percentage}%` }}
                  />
                </div>
                <span className="text-xs text-text-main text-left w-36 shrink-0 truncate">{b.profile}</span>
              </motion.div>
            ))}
          </div>

          {data.driftNotes.length > 0 && (
            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">What's shifting this</p>
              {data.driftNotes.map((note, i) => (
                <p key={i} className="text-xs text-text-muted leading-relaxed">{note}</p>
              ))}
            </div>
          )}

          {!data.hasCalendarSignal && !data.hasSlackSignal && (
            <p className="text-xs text-text-muted italic">
              Connect Google Calendar or Slack in Settings to let this evolve from real behavior, not just your last quiz.
            </p>
          )}
        </>
      )}
    </div>
  );
};

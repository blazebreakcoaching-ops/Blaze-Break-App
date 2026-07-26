import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Radio } from 'lucide-react';
import { cn } from '../lib/utils';
import { secureApiFetch } from '../lib/secure-api';

interface Factor {
  label: string;
  detail: string;
  impact: 'high' | 'moderate';
}

interface ExplanationData {
  hasData: boolean;
  realSignalScore: number | null;
  factors: Factor[];
  narrative: string;
  hasCalendarSignal?: boolean;
  hasSlackSignal?: boolean;
}

// The causal-narrative layer behind the Recovery Score: what's actually
// observable in connected accounts, not self-report. Deliberately a small,
// collapsed-by-default section within the existing hero card rather than a
// separate widget — the goal is one coherent explainable score, not another
// number competing for attention on an already-busy home screen.
export const RecoveryExplanation = () => {
  const [data, setData] = useState<ExplanationData | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    secureApiFetch('/api/signals/recovery-explanation')
      .then((res) => res.json())
      .then(setData)
      .catch(() => {
        // Silent — this is a supplementary explanation, not core functionality.
      });
  }, []);

  if (!data) return null;

  return (
    <div className="pt-4">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-primary transition-colors"
      >
        <Radio className="w-3.5 h-3.5" />
        <span>Why this score, really?</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-4 space-y-3 max-w-xl">
              <p className="text-sm text-text-muted leading-relaxed italic">{data.narrative}</p>
              {data.factors.length > 0 && (
                <div className="space-y-2">
                  {data.factors.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0",
                        f.impact === 'high' ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                      )}>
                        {f.impact}
                      </span>
                      <div>
                        <span className="font-bold text-text-main">{f.label}</span>
                        <span className="text-text-muted"> — {f.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-text-muted/70 uppercase tracking-widest pt-1">
                From your connected accounts, separate from your self check-ins above
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import { useState } from 'react';
import { motion } from 'motion/react';
import { Feather, RotateCcw, LifeBuoy } from 'lucide-react';
import { auth } from '../lib/firebase';
import { recordSparkAnswer } from '../lib/reset-studio-service';
import {
  SPARK_ANSWER_ORDER, SPARK_ANSWER_LABELS, SPARK_SUGGESTIONS, SparkAnswer,
  shouldOfferQuickSupportForSpark,
} from '../../reset-studio-engine';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';

export const SparkCheck = ({ onNavigate, onOpenCrisisSupport }: {
  onNavigate?: (tab: string) => void;
  onOpenCrisisSupport?: () => void;
}) => {
  const [answer, setAnswer] = useState<SparkAnswer | null>(null);
  const [offerSupport, setOfferSupport] = useState(false);

  const handleAnswer = async (a: SparkAnswer) => {
    setAnswer(a);
    updateNovaMemoryBySourceAndType('Spark Check', 'state', {
      content: `Spark Check: closest answer was "${SPARK_ANSWER_LABELS[a]}".`,
      confidence: 'verified',
      canEdit: true,
    });
    if (auth.currentUser) {
      const recent = await recordSparkAnswer(auth.currentUser.uid, a);
      setOfferSupport(shouldOfferQuickSupportForSpark(recent));
    }
  };

  const resetAll = () => {
    setAnswer(null);
    setOfferSupport(false);
  };

  return (
    <div className="card bg-background border border-border p-10 lg:p-14 text-text-main relative overflow-hidden">
      <div className="relative z-10 max-w-3xl space-y-10 mx-auto">
        <div className="space-y-6 text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/10 to-primary/10 border border-primary/20 text-primary">
            <Feather className="w-8 h-8" />
          </div>
          <div className="space-y-4">
            <h3 className="text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-text-main">The Spark Check</h3>
            <p className="text-text-muted leading-relaxed max-w-xl text-center mx-auto text-sm lg:text-base">
              Flat isn't laziness and it isn't a motivation failure. What sounds closest?
            </p>
          </div>
        </div>

        {!answer && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SPARK_ANSWER_ORDER.map((a) => (
              <button
                key={a}
                onClick={() => handleAnswer(a)}
                className="p-4 rounded-xl border border-border hover:border-primary/50 text-left font-bold text-text-main transition-colors"
              >
                {SPARK_ANSWER_LABELS[a]}
              </button>
            ))}
          </div>
        )}

        {answer && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 text-center">
            <div className="p-8 rounded-2xl border border-primary/30 bg-primary/5 space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-primary">One small thing</span>
              <p className="text-2xl font-display font-bold text-text-main">{SPARK_SUGGESTIONS[answer]}</p>
            </div>

            {SPARK_SUGGESTIONS[answer] === 'Talk to Nova' && onNavigate && (
              <button onClick={() => onNavigate('nova')} className="btn-primary py-2.5 px-6 text-sm mx-auto">
                Go talk to Nova
              </button>
            )}

            {offerSupport && (
              <div className="p-5 rounded-2xl border border-border bg-surface/60 space-y-3">
                <p className="text-sm text-text-main font-medium">This has come up a few times. Would it help to talk to someone?</p>
                {onOpenCrisisSupport && (
                  <button onClick={onOpenCrisisSupport} className="flex items-center gap-2 mx-auto text-xs font-black uppercase tracking-widest text-primary hover:underline">
                    <LifeBuoy className="w-4 h-4" /> Need Support Now
                  </button>
                )}
              </div>
            )}

            <button
              onClick={resetAll}
              className="text-xs font-black uppercase tracking-[0.2em] text-text-muted hover:text-text-main flex items-center gap-2 transition-colors px-6 py-3 rounded-full hover:bg-white/[0.02] border border-transparent hover:border-white/[0.05] mx-auto"
            >
              <RotateCcw className="w-3 h-3" /> Start Over
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

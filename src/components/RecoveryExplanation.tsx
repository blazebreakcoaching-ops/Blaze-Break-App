import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Radio } from 'lucide-react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { secureApiFetch } from '../lib/secure-api';

interface Factor {
  label: string;
  delta: number;
  source: 'self-report' | 'calendar' | 'slack';
}

interface ExplainResponse {
  score: number;
  factors: Factor[];
  hasRealSignals: boolean;
}

interface RecoveryExplanationProps {
  energyLevel: number;
  debtCount: number;
  isHighFunctioningExhausted: boolean;
  hasClaimedDaily: boolean;
  rehearsalCount: number;
  streak: number;
}

const SOURCE_LABEL: Record<Factor['source'], string> = {
  'self-report': 'Check-in',
  calendar: 'Calendar',
  slack: 'Slack',
};

// The causal-narrative layer behind the Recovery Score: unifies self-report
// factors (matching calculateRecoveryScore in App.tsx, so the number itself
// stays consistent) with real calendar/Slack signals into one explanation,
// each factor tagged by where it actually came from. Collapsed by default
// inside the existing hero card rather than a separate widget — one coherent
// explainable score, not another number competing for attention.
export const RecoveryExplanation = ({
  energyLevel, debtCount, isHighFunctioningExhausted, hasClaimedDaily, rehearsalCount, streak,
}: RecoveryExplanationProps) => {
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const loadSignalsAndExplain = async () => {
      let moodPositive: boolean | null = null;
      let triggerCount = 0;
      // No real signal source exists yet for social battery / focus shield -
      // left null/false (honest "no data") rather than fabricated.
      const socialBattery: number | null = null;
      let winsCount = 0;
      let symptomsCount = 0;
      const focusShieldActive = false;

      try {
        const [moodSnap, triggerSnap, winsSnap, bodySnap] = await Promise.all([
          getDocs(query(collection(db, 'users', uid, 'emotional_patterns'), orderBy('createdAt', 'desc'), limit(1))),
          getDocs(query(collection(db, 'users', uid, 'stress_triggers'), orderBy('createdAt', 'desc'), limit(30))),
          getDocs(query(collection(db, 'users', uid, 'wins'), orderBy('createdAt', 'desc'), limit(30))),
          getDocs(query(collection(db, 'users', uid, 'body_checkins'), orderBy('createdAt', 'desc'), limit(1))),
        ]);

        if (!moodSnap.empty) {
          moodPositive = (moodSnap.docs[0].data() as any).category === 'positive';
        }
        triggerCount = triggerSnap.size;
        winsCount = winsSnap.size;
        if (!bodySnap.empty) {
          symptomsCount = ((bodySnap.docs[0].data() as any).signals || []).length;
        }
      } catch (e) {
        // Real signals unavailable — fall back to the defaults above rather than blocking the explanation.
      }

      secureApiFetch('/api/signals/recovery-explain', {
        method: 'POST',
        data: {
          energyLevel, debtCount, isHighFunctioningExhausted, hasClaimedDaily, rehearsalCount, streak,
          moodPositive, triggerCount, socialBattery, winsCount, symptomsCount, focusShieldActive,
        },
      })
        .then((res) => res.json())
        .then(setData)
        .catch(() => {
          // Silent — this is a supplementary explanation, not core functionality.
        });
    };

    loadSignalsAndExplain();
  }, [energyLevel, debtCount, isHighFunctioningExhausted, hasClaimedDaily, rehearsalCount, streak]);

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
            <div className="pt-4 space-y-2 max-w-xl">
              {data.factors.map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className={cn(
                    "px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 w-16 text-center",
                    f.source === 'self-report' ? "bg-primary/10 text-primary" : "bg-info/10 text-info"
                  )}>
                    {SOURCE_LABEL[f.source]}
                  </span>
                  <span className="text-text-main flex-1">{f.label}</span>
                  <span className={cn("font-bold", f.delta > 0 ? "text-success" : f.delta < 0 ? "text-destructive" : "text-text-muted")}>
                    {f.delta > 0 ? '+' : ''}{f.delta}
                  </span>
                </div>
              ))}
              {!data.hasRealSignals && (
                <p className="text-[10px] text-text-muted/70 uppercase tracking-widest pt-1">
                  Connect Google Calendar or Slack in Settings to add real behavioral signals here, not just check-ins
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

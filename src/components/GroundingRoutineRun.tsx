import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight, CheckCircle2, Feather } from 'lucide-react';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { doc, setDoc } from 'firebase/firestore';
import { GroundingLens } from '../../grounding-content';
import { ClosingStyle, CLOSING_STYLES } from '../../grounding-adaptive';
import { EVENING_ISLAMIC_CLOSING } from '../../grounding-routines';
import { logGroundingEvent } from '../lib/grounding-analytics';
import { GroundingVoiceControls } from './GroundingVoiceControls';

// Generic run-through for any routine - the 4 presets and a custom
// routine all reduce to the same shape (a short prompt sequence + a
// closing style), so one component walks through all of them rather
// than duplicating GroundingResetFlow's step machine per routine type.
interface GroundingRoutineRunProps {
  routineId: string | null; // null for a preset that hasn't been saved as a doc
  name: string;
  prompts: string[];
  finishPrompt?: string;
  closingStyle: ClosingStyle;
  lens: GroundingLens;
  onClose: () => void;
  voiceEnabled?: boolean;
}

export const GroundingRoutineRun = ({ routineId, name, prompts, finishPrompt, closingStyle, lens, onClose, voiceEnabled = false }: GroundingRoutineRunProps) => {
  const allPrompts = finishPrompt ? [...prompts, finishPrompt] : prompts;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(allPrompts.length).fill(''));
  const [done, setDone] = useState(false);

  const setAnswer = (value: string) => {
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));
  };

  const finish = async () => {
    setDone(true);
    logGroundingEvent('routine_completed');
    if (auth.currentUser && routineId) {
      setDoc(doc(db, 'users', auth.currentUser.uid, 'groundingRoutines', routineId), {
        lastCompletedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl bg-card border border-border/40 rounded-2xl p-8 space-y-8 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-display font-bold text-text-main">{name}</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-main"><X className="w-4 h-4" /></button>
        </div>

        {done ? (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
            <p className="text-base text-text-main font-medium">{CLOSING_STYLES[closingStyle]}</p>
            {lens === 'islamic' && (
              <div className="pt-2 space-y-3">
                <p className="text-sm text-text-muted italic">{EVENING_ISLAMIC_CLOSING}</p>
                <p className="text-xs text-text-muted flex items-center justify-center gap-1.5"><Feather className="w-3 h-3" /> Take a moment for du'a, dhikr or prayer</p>
              </div>
            )}
            <button onClick={onClose} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest">Close</button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-lg font-display font-bold text-text-main">{allPrompts[index]}</h4>
                <GroundingVoiceControls text={allPrompts[index]!} enabled={voiceEnabled} />
              </div>
              <textarea
                value={answers[index]}
                onChange={(e) => setAnswer(e.target.value.slice(0, 400))}
                rows={3}
                autoFocus
                placeholder="In your own words..."
                className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => (index < allPrompts.length - 1 ? setIndex(index + 1) : finish())}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2"
                >
                  {index < allPrompts.length - 1 ? 'Continue' : 'Finish'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
};

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ArrowLeft, X, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { collection, addDoc } from 'firebase/firestore';
import {
  DerivedPattern, PATTERN_DIMENSIONS, EXPLORE_QUESTION_SETS,
  MEANING_PROMPTS_GENERAL, MEANING_PROMPTS_FAITH_EXTRA, MEANING_MAKING_INTRO, MEANING_MAKING_INTRO_ISLAMIC,
  VALUES_LIST, MeaningPromptId,
} from '../../grounding-patterns-taxonomy';
import { GroundingLens } from '../../grounding-content';
import { logGroundingEvent } from '../lib/grounding-analytics';

interface GroundingExploreThisProps {
  pattern: DerivedPattern;
  lens: GroundingLens;
  onClose: () => void;
}

type ExploreStage = 'questions' | 'meaning' | 'values' | 'done';

export const GroundingExploreThis = ({ pattern, lens, onClose }: GroundingExploreThisProps) => {
  const dimension = PATTERN_DIMENSIONS[pattern.patternKey];
  const questionSet = EXPLORE_QUESTION_SETS[pattern.category];

  const [stage, setStage] = useState<ExploreStage>('questions');
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answer, setAnswer] = useState('');

  const [selectedMeaningPrompts, setSelectedMeaningPrompts] = useState<MeaningPromptId[]>([]);
  const [meaningText, setMeaningText] = useState('');

  const [chosenValue, setChosenValue] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [alignedAction, setAlignedAction] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleMeaningPrompt = (id: MeaningPromptId) => {
    setSelectedMeaningPrompts((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handleNextQuestion = () => {
    setAnswer('');
    if (questionIdx < questionSet.questions.length - 1) {
      setQuestionIdx((i) => i + 1);
    } else {
      setStage('meaning');
    }
  };

  const finalValue = chosenValue === '__custom__' ? customValue.trim().slice(0, 40) : chosenValue;

  const handleSave = async () => {
    if (!finalValue || !alignedAction.trim()) return;
    setSaving(true);
    try {
      if (auth.currentUser) {
        const now = new Date().toISOString();
        await addDoc(collection(db, 'users', auth.currentUser.uid, 'aligned_actions'), {
          chosenValue: finalValue,
          nextAlignedAction: alignedAction.trim().slice(0, 200),
          patternKey: pattern.patternKey,
          createdAt: now,
          updatedAt: now,
        });
        logGroundingEvent('aligned_action_created', { category: pattern.category, lens });
      }
    } catch (e) {
      // Non-fatal - the person still sees the completion screen even if
      // the save failed; nothing about this flow should feel like it broke.
    }
    setSaving(false);
    setStage('done');
  };

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl bg-card border border-border/40 rounded-2xl p-8 space-y-8 my-8"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-text-muted">{dimension.label}</span>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-main">
            <X className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {stage === 'questions' && (
            <motion.div key={`q-${questionIdx}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {questionIdx === 0 && (
                <p className="text-sm text-text-muted leading-relaxed">{questionSet.openingTemplate(dimension.label)}</p>
              )}
              <h4 className="text-xl font-display font-bold text-text-main">{questionSet.questions[questionIdx]}</h4>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="Take your time..."
                className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
                autoFocus
              />
              <div className="flex justify-end">
                <button onClick={handleNextQuestion} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {stage === 'meaning' && (
            <motion.div key="meaning" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <h4 className="text-xl font-display font-bold text-text-main">What might this experience be showing you?</h4>
              <p className="text-sm text-text-muted leading-relaxed">
                {lens === 'islamic' || lens === 'faith' ? MEANING_MAKING_INTRO_ISLAMIC : MEANING_MAKING_INTRO}
              </p>
              <div className="flex flex-wrap gap-2">
                {[...MEANING_PROMPTS_GENERAL, ...((lens === 'islamic' || lens === 'faith') ? MEANING_PROMPTS_FAITH_EXTRA : [])].map((p) => (
                  <button key={p.id} onClick={() => toggleMeaningPrompt(p.id)} aria-pressed={selectedMeaningPrompts.includes(p.id)}
                    className={cn('px-3 py-2 rounded-lg text-xs font-bold border transition-all',
                      selectedMeaningPrompts.includes(p.id) ? 'bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>
                    {p.label}
                  </button>
                ))}
              </div>
              <textarea
                value={meaningText}
                onChange={(e) => setMeaningText(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Optional - whatever comes up..."
                className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
              />
              <div className="flex justify-between">
                <button onClick={() => setStage('values')} className="px-4 py-3 text-text-muted hover:text-text-main text-xs font-black uppercase tracking-widest">
                  Skip this
                </button>
                <button onClick={() => setStage('values')} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {stage === 'values' && (
            <motion.div key="values" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <h4 className="text-xl font-display font-bold text-text-main">Which value do you want to lead with here?</h4>
              <div className="flex flex-wrap gap-2">
                {VALUES_LIST.map((v) => (
                  <button key={v} onClick={() => setChosenValue(v)} aria-pressed={chosenValue === v}
                    className={cn('px-3 py-2 rounded-lg text-xs font-bold border transition-all',
                      chosenValue === v ? 'bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>
                    {v}
                  </button>
                ))}
                <button onClick={() => setChosenValue('__custom__')} aria-pressed={chosenValue === '__custom__'}
                  className={cn('px-3 py-2 rounded-lg text-xs font-bold border transition-all',
                    chosenValue === '__custom__' ? 'bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>
                  Something else
                </button>
              </div>
              {chosenValue === '__custom__' && (
                <input value={customValue} onChange={(e) => setCustomValue(e.target.value.slice(0, 40))} placeholder="Your own value..."
                  className="w-full p-3 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main" />
              )}
              {finalValue && (
                <div className="space-y-3">
                  <h5 className="text-sm font-bold text-text-main">What would one action aligned with {finalValue.toLowerCase()} look like?</h5>
                  <textarea
                    value={alignedAction}
                    onChange={(e) => setAlignedAction(e.target.value.slice(0, 200))}
                    rows={3}
                    placeholder="One small, real, doable step..."
                    className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
                  />
                </div>
              )}
              <div className="flex justify-between">
                <button onClick={() => setStage('meaning')} className="px-4 py-3 text-text-muted hover:text-text-main text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  disabled={!finalValue || !alignedAction.trim() || saving}
                  onClick={handleSave}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40"
                >
                  {saving ? 'Saving...' : 'Finish'}
                </button>
              </div>
            </motion.div>
          )}

          {stage === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-success dark:text-[#4ade80] mx-auto" />
              <p className="text-sm text-text-muted leading-relaxed max-w-sm mx-auto">
                You've named something real. Next time you're here, this might gently come back up.
              </p>
              <button onClick={onClose} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest">
                Close
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

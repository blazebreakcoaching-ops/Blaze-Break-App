import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ArrowLeft, CheckCircle2, Hand } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { collection, addDoc } from 'firebase/firestore';
import { BurdenId, BURDEN_OPTIONS, NextActionId, NEXT_ACTION_OPTIONS } from '../../grounding-content';
import { DerivedPattern } from '../../grounding-patterns-taxonomy';
import { AdaptivePrompt } from '../../grounding-adaptive';
import { getAdaptivePromptSet } from '../lib/grounding-personalisation';
import { logGroundingEvent } from '../lib/grounding-analytics';
import { GroundingVoiceControls } from './GroundingVoiceControls';

// Phase 3's Reset mode (section 1) - "approximately 1-2 minutes", the
// short path for very low capacity, an explicit quick choice, or a
// familiar repeating theme. Deliberately its OWN small flow, not a
// trimmed-down copy of the 5-stage Ground/Deep machine in
// FaithValuesMode.tsx - "Do not turn Reset into a mini version of every
// Phase 1 screen. It should feel genuinely brief." No AI call anywhere in
// this flow: the one reflection question comes from the deterministic
// adaptive prompt engine (grounding-adaptive.ts), not a live model call -
// a 1-2 minute session shouldn't need one, and it keeps this path
// available even if Nova/the network is unavailable (section 34).
type ResetStep = 'heaviest' | 'control' | 'reflect' | 'release' | 'next';

const HOLD_DURATION_MS = 1200;

interface GroundingResetFlowProps {
  derivedPatterns: DerivedPattern[];
  onBack: () => void;
  onComplete: () => void;
  voiceEnabled?: boolean;
}

export const GroundingResetFlow = ({ derivedPatterns, onBack, onComplete, voiceEnabled = false }: GroundingResetFlowProps) => {
  const [step, setStep] = useState<ResetStep>('heaviest');
  const [burdenIds, setBurdenIds] = useState<BurdenId[]>([]);
  const [controlAnswer, setControlAnswer] = useState('');
  const [prompt, setPrompt] = useState<AdaptivePrompt | null>(null);
  const [reflectAnswer, setReflectAnswer] = useState('');
  const [holding, setHolding] = useState(false);
  const [released, setReleased] = useState(false);
  const [chosenNextAction, setChosenNextAction] = useState<NextActionId | null>(null);
  const [saving, setSaving] = useState(false);

  const topPatternKey = derivedPatterns[0]?.patternKey || 'control';

  useEffect(() => {
    if (step !== 'reflect' || prompt) return;
    if (!auth.currentUser) { setPrompt({ promptKey: 'control_1', text: 'What is actually within your control?' }); return; }
    getAdaptivePromptSet(auth.currentUser.uid, topPatternKey).then(setPrompt);
  }, [step, prompt, topPatternKey]);

  const toggleBurden = (id: BurdenId) => {
    setBurdenIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const onHoldStart = () => {
    if (released) return;
    setHolding(true);
    window.setTimeout(() => { setReleased(true); setHolding(false); }, HOLD_DURATION_MS);
  };
  const onHoldEnd = () => { if (!released) setHolding(false); };

  const handleNextAction = async (action: NextActionId) => {
    setChosenNextAction(action);
    if (!auth.currentUser) { onComplete(); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const record: Record<string, unknown> = {
        lens: 'secular', burdenIds, controllableItems: [], uncontrollableItems: [],
        sessionDepth: 'reset', nextAction: action, createdAt: now, updatedAt: now,
      };
      const answers: { question: string; answer: string }[] = [];
      if (controlAnswer.trim()) answers.push({ question: 'What is actually within your control?', answer: controlAnswer.trim().slice(0, 400) });
      if (prompt && reflectAnswer.trim()) answers.push({ question: prompt.text, answer: reflectAnswer.trim().slice(0, 400) });
      if (answers.length > 0) record.reflectionAnswers = answers;
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'grounding_sessions'), record);
      logGroundingEvent('grounding_session_completed', { lens: 'secular' });
    } catch (e) {
      // Non-fatal - the person's Reset still completed even if the save failed.
    }
    setSaving(false);
    if (action === 'community' || action === 'trusted_person' || action === 'next_step' || action === 'continue_with_nova') {
      // These all navigate elsewhere - let the same events FaithValuesMode
      // already listens for handle it rather than duplicating that logic.
      window.dispatchEvent(new CustomEvent(
        action === 'continue_with_nova' ? 'open_nova_launcher' : 'navigate_tab',
        action === 'trusted_person' ? { detail: 'ally' } : action === 'community' ? { detail: 'home' } : { detail: 'recover' }
      ));
    }
    setTimeout(() => onComplete(), action === 'sit_with_this' || action === 'return_to_blaze_break' ? 600 : 0);
  };

  return (
    <div className="space-y-8 max-w-xl">
      <button onClick={onBack} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main flex items-center gap-2">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <AnimatePresence mode="wait">
        {step === 'heaviest' && (
          <motion.div key="heaviest" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-2xl font-display font-bold text-text-main">What feels heaviest right now?</h4>
              <GroundingVoiceControls text="What feels heaviest right now?" enabled={voiceEnabled} />
            </div>
            <div className="flex flex-wrap gap-2">
              {BURDEN_OPTIONS.filter((o) => o.id !== 'other').map((o) => (
                <button key={o.id} onClick={() => toggleBurden(o.id)} aria-pressed={burdenIds.includes(o.id)}
                  className={cn('px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer',
                    burdenIds.includes(o.id) ? 'bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border')}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button disabled={burdenIds.length === 0} onClick={() => setStep('control')}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'control' && (
          <motion.div key="control" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-2xl font-display font-bold text-text-main">What is actually within your control?</h4>
              <GroundingVoiceControls text="What is actually within your control?" enabled={voiceEnabled} />
            </div>
            <textarea value={controlAnswer} onChange={(e) => setControlAnswer(e.target.value.slice(0, 400))} rows={3}
              placeholder="In a few words..." autoFocus
              className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main" />
            <div className="flex justify-end">
              <button onClick={() => setStep('reflect')} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'reflect' && (
          <motion.div key="reflect" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {prompt ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-2xl font-display font-bold text-text-main">{prompt.text}</h4>
                  <GroundingVoiceControls text={prompt.text} enabled={voiceEnabled} />
                </div>
                <textarea value={reflectAnswer} onChange={(e) => setReflectAnswer(e.target.value.slice(0, 400))} rows={3}
                  placeholder="Take a moment..." autoFocus
                  className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main" />
                <div className="flex justify-end">
                  <button onClick={() => setStep('release')} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted">Loading...</p>
            )}
          </motion.div>
        )}

        {step === 'release' && (
          <motion.div key="release" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
            <div className="flex flex-col items-center gap-4 py-6">
              <button
                onPointerDown={onHoldStart}
                onPointerUp={onHoldEnd}
                onPointerLeave={onHoldEnd}
                disabled={released}
                className="relative w-32 h-32 rounded-full border-2 border-primary/30 flex items-center justify-center overflow-hidden select-none cursor-pointer disabled:cursor-default"
              >
                <div
                  className="absolute inset-0 bg-primary/20 rounded-full origin-bottom"
                  style={{
                    transform: holding || released ? 'scaleY(1)' : 'scaleY(0)',
                    transition: holding ? `transform ${HOLD_DURATION_MS}ms linear` : 'transform 200ms ease-out',
                  }}
                />
                <div className="relative z-10">
                  {released ? <CheckCircle2 className="w-7 h-7 text-primary" /> : <Hand className="w-7 h-7 text-text-muted" />}
                </div>
              </button>
              <p className="text-sm text-text-muted text-center">{released ? 'Released.' : "Hold to release what isn't yours to carry"}</p>
            </div>
            {released && (
              <div className="flex justify-end">
                <button onClick={() => setStep('next')} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === 'next' && (
          <motion.div key="next" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <h4 className="text-2xl font-display font-bold text-text-main">What do you need next?</h4>
            {!chosenNextAction ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {NEXT_ACTION_OPTIONS.map((opt) => (
                  <button key={opt.id} onClick={() => handleNextAction(opt.id)} disabled={saving}
                    className="p-4 rounded-xl border border-border/40 hover:border-primary/40 text-left bg-white dark:bg-surface transition-all disabled:opacity-60">
                    <h5 className="text-sm font-bold text-text-main">{opt.label}</h5>
                    <p className="text-xs text-text-muted mt-1">{opt.description}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-success/5 border border-success/20 p-6 rounded-2xl text-center">
                <CheckCircle2 className="w-6 h-6 text-success dark:text-[#4ade80] mx-auto mb-3" />
                <p className="text-sm text-text-muted">That's enough for now.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

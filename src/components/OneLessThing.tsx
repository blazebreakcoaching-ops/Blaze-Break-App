import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MinusCircle, Brain, Trash2, Clock, Users, Zap, CheckCircle2, WifiOff, HelpCircle, Share2, CircleDot } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';
import { secureApiFetch } from '../lib/secure-api';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { auth } from '../lib/firebase';
import { loadStressors, resolveStressor, reportStressorReduction, addStressor } from '../lib/energy-delta-service';
import { Stressor, ReductionLevel } from '../../energy-delta-engine';
import { recordOneLessThingCompletion, loadOneLessThingTotalCompletions, recordRediscoveryClue } from '../lib/rediscovery-service';
import { shouldAskWhyOnPlate, PLATE_REASON_ORDER, PLATE_REASON_LABELS, PlateReasonId } from '../../rediscovery-engine';

interface OneLessThingProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type Step = 'initial' | 'input' | 'analyzing' | 'result';

// ONE LESS THING's seven possible outcomes - "Nova should help the user
// identify one actual demand. Do not create a long productivity exercise."
// Nova (or the offline heuristic) suggests one; the user can pick a
// different one from this same list at any time.
type OutcomeAction = 'Cancel' | 'Delegate' | 'Delay' | 'Make Smaller' | 'Ask For Help' | 'Share' | 'Keep';

const OUTCOME_ORDER: OutcomeAction[] = ['Cancel', 'Delegate', 'Delay', 'Make Smaller', 'Ask For Help', 'Share', 'Keep'];

// Each outcome carries its own destructive/success/primary/warning/neutral
// color, but a solid background only reads correctly with the matching
// -foreground token (verified elsewhere this session) - reused rather
// than inventing new design tokens for the two extra outcomes.
const SOLID_BG_TEXT: Record<string, string> = {
  'text-destructive': 'text-destructive-foreground',
  'text-success': 'text-success-foreground',
  'text-primary': 'text-primary-foreground',
  'text-warning': 'text-warning-foreground',
  'text-text-muted': 'text-text-main',
};
const CARD_TEXT: Record<string, string> = {
  'text-destructive': 'text-destructive dark:text-[#f87171]',
  'text-success': 'text-[#166534] dark:text-[#4ade80]',
  'text-primary': 'text-[#9a3412] dark:text-primary',
  'text-warning': 'text-[#9a3412] dark:text-warning',
  'text-text-muted': 'text-text-muted',
};

const STYLE_BY_ACTION: Record<OutcomeAction, { icon: any; colorClass: string; bgColorClass: string; borderClass: string }> = {
  Cancel: { icon: Trash2, colorClass: 'text-destructive', bgColorClass: 'bg-destructive', borderClass: 'border-destructive/30' },
  Delegate: { icon: Users, colorClass: 'text-primary', bgColorClass: 'bg-primary', borderClass: 'border-primary/30' },
  Delay: { icon: Clock, colorClass: 'text-warning', bgColorClass: 'bg-warning', borderClass: 'border-warning/30' },
  'Make Smaller': { icon: Zap, colorClass: 'text-success', bgColorClass: 'bg-success', borderClass: 'border-success/30' },
  'Ask For Help': { icon: HelpCircle, colorClass: 'text-primary', bgColorClass: 'bg-primary', borderClass: 'border-primary/30' },
  Share: { icon: Share2, colorClass: 'text-success', bgColorClass: 'bg-success', borderClass: 'border-success/30' },
  Keep: { icon: CircleDot, colorClass: 'text-text-muted', bgColorClass: 'bg-border', borderClass: 'border-border' },
};

// Delete/Delegate genuinely remove the demand. Delay/Make Smaller/Ask For
// Help/Share all reduce it without fully resolving it. Keep makes no
// change at all - "Do not award Capacity Protected merely because the
// user opened or completed the workflow."
const ACTION_RESOLVES: Record<OutcomeAction, boolean> = {
  Cancel: true, Delegate: true, Delay: false, 'Make Smaller': false, 'Ask For Help': false, Share: false, Keep: false,
};
const ACTION_REDUCTION: Record<Exclude<OutcomeAction, 'Keep'>, ReductionLevel> = {
  Cancel: 'a_lot', Delegate: 'a_lot', Delay: 'a_lot', 'Make Smaller': 'meaningfully', 'Ask For Help': 'meaningfully', Share: 'meaningfully',
};

export const OneLessThing = ({ fingerprint, onAwardPoints }: OneLessThingProps) => {
  const [step, setStep] = useState<Step>('initial');
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const isFirstStepRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstStepRenderRef.current) {
      isFirstStepRenderRef.current = false;
      return;
    }
    if (step === 'input') return;
    const t = window.setTimeout(() => {
      const heading = stepContainerRef.current?.querySelector<HTMLElement>('h3');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [step]);
  const [task, setTask] = useState('');
  const [activeStressors, setActiveStressors] = useState<Stressor[]>([]);
  const [selectedStressorId, setSelectedStressorId] = useState<string | 'new' | ''>('');
  const [reducedCapacity, setReducedCapacity] = useState(false);
  const [showWhyQuestion, setShowWhyQuestion] = useState(false);
  const [whyAnswered, setWhyAnswered] = useState(false);

  useEffect(() => {
    if (step !== 'input' || !auth.currentUser) return;
    loadStressors(auth.currentUser.uid).then((list) => setActiveStressors(list.filter((s) => s.status === 'active')));
  }, [step]);

  const [result, setResult] = useState<{
    action: OutcomeAction;
    advice: string;
    template?: string;
    icon: any;
    colorClass: string;
    bgColorClass: string;
    borderClass: string;
    isFallback: boolean;
  } | null>(null);

  // The local, deterministic fallback - used ONLY when the real Nova call
  // fails (no network, server not configured, timeout). Marked honestly
  // on the result screen rather than presented as Nova's live reasoning.
  const heuristicOutcome = (rawTask: string) => {
    const lowerTask = rawTask.toLowerCase();
    if (lowerTask.includes('meeting') || lowerTask.includes('review')) {
      return {
        action: 'Cancel' as const,
        advice: "This doesn't need to happen today, and possibly doesn't need to happen at all. Cancel it or ask for an async update.",
        template: "Hi team, I'm re-evaluating priorities for today to protect focus time. Let's handle this update asynchronously via Slack/Email instead of a meeting.",
      };
    }
    if (lowerTask.includes('report') || lowerTask.includes('presentation') || lowerTask.includes('deck')) {
      return {
        action: 'Make Smaller' as const,
        advice: "Lower the fidelity. Stop trying to make it perfect. Give them the rough draft, the bullet points, or the raw data.",
        template: "Here is the raw data / rough outline. I wanted to get this to you quickly rather than over-polishing. Let me know if you need specific details expanded.",
      };
    }
    if (lowerTask.includes('help') || lowerTask.includes('team') || lowerTask.includes('fix')) {
      return {
        action: 'Delegate' as const,
        advice: "You are hoarding execution. Hand this off. Let someone else solve it at 80% quality instead of you doing it at 100%.",
        template: "Hey, I need to pass this over to you to run with. Do your best with it, no need to run decisions by me unless it's a catastrophic blocker.",
      };
    }
    if (lowerTask.includes('alone') || lowerTask.includes('myself') || lowerTask.includes('nobody')) {
      return {
        action: 'Ask For Help' as const,
        advice: "You don't have to carry this entirely on your own. Name one specific person who could take part of it.",
        template: "Could you help me with part of this? I don't need you to take the whole thing, just a piece of it.",
      };
    }
    return {
      action: 'Delay' as const,
      advice: "This is a false emergency. Push it to next week. The business will not collapse.",
      template: "To ensure I can give this the attention it needs, I am going to push my delivery on this to early next week. Let me know if that creates a critical blocker.",
    };
  };

  const handleAnalyze = async () => {
    if (!task.trim()) return;
    setStep('analyzing');

    let outcome: { action: OutcomeAction; advice: string; template?: string };
    let isFallback = false;

    try {
      const res = await secureApiFetch('/api/nova/one-less-thing', {
        method: 'POST',
        data: { task: task.trim() },
      });
      if (!res.ok) throw new Error('Nova analysis unavailable');
      const data = await res.json();
      if (!OUTCOME_ORDER.includes(data.action)) throw new Error('Unexpected response');
      outcome = { action: data.action, advice: data.advice, template: data.template };
    } catch {
      outcome = heuristicOutcome(task);
      isFallback = true;
    }

    const style = STYLE_BY_ACTION[outcome.action];
    setResult({ ...outcome, ...style, isFallback });
    setStep('result');
    if (onAwardPoints) onAwardPoints(10, 'Completed One Less Thing');
    updateNovaMemoryBySourceAndType('One Less Thing', 'state', {
      content: `Named overwhelming task "${task.trim()}" - disposition: ${outcome.action}.`,
      confidence: 'verified',
      canEdit: true,
    });

    // ONE LESS THING — DEEPER QUESTIONING: occasional, not every time.
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      const priorCompletions = await loadOneLessThingTotalCompletions(uid);
      recordOneLessThingCompletion(uid).catch(() => {});
      setShowWhyQuestion(shouldAskWhyOnPlate(priorCompletions));
    }
  };

  const handleReset = () => {
    setTask('');
    setResult(null);
    setStep('initial');
    setSelectedStressorId('');
    setReducedCapacity(false);
    setActiveStressors([]);
    setShowWhyQuestion(false);
    setWhyAnswered(false);
  };

  const handleConnectReduction = async () => {
    if (!selectedStressorId || !result || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    try {
      let stressorId = selectedStressorId;
      if (selectedStressorId === 'new') {
        const created = await addStressor(uid, { name: task.trim(), category: 'professional', severity: 3, persistence: 'one_off' });
        stressorId = created.id;
      }
      if (ACTION_RESOLVES[result.action]) {
        await resolveStressor(uid, stressorId);
      } else if (result.action !== 'Keep') {
        await reportStressorReduction(uid, stressorId, ACTION_REDUCTION[result.action]);
      }
      setReducedCapacity(true);
    } catch {
      // Non-fatal - the One Less Thing completion itself still counts.
    }
  };

  const handleWhyAnswer = (reasonId: PlateReasonId) => {
    if (!auth.currentUser) { setWhyAnswered(true); return; }
    recordRediscoveryClue(
      auth.currentUser.uid,
      'one_less_thing_why',
      'Why was this on your plate in the first place?',
      PLATE_REASON_LABELS[reasonId]
    ).catch(() => {});
    setWhyAnswered(true);
  };

  return (
    <div id="one-less-thing-section" className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Stabilise · Untangle · Core Pillar: Rebuild</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">One Less Thing</h3>
            <p className="text-xl text-text-muted font-medium max-w-2xl">
              You may not need another recovery task. You may need less to carry.
            </p>
          </div>
        </div>
      </div>

      <div ref={stepContainerRef} className="flex justify-center py-8">
        <AnimatePresence mode="wait">

          {step === 'initial' && (
            <motion.div
              key="initial"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="w-full max-w-md"
            >
              <button
                onClick={() => setStep('input')}
                className="w-full aspect-square md:aspect-auto md:h-80 rounded-xl bg-primary hover:opacity-90 transition-all flex flex-col items-center justify-center p-8 text-primary-foreground shadow-lg shadow-primary/20 group hover:scale-[1.02]"
              >
                <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                  <MinusCircle className="w-12 h-12" />
                </div>
                <h3 className="text-3xl font-display font-bold text-center leading-tight mb-2">Help me remove<br/>one thing.</h3>
                <p className="font-medium text-center">Let's find something you can cancel, delay, delegate, shorten or stop carrying alone.</p>
              </button>
            </motion.div>
          )}

          {step === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl card p-8 md:p-12 border border-border"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-display font-bold text-text-main">Identify the Weight</h3>
              </div>
              <p className="text-text-muted text-lg mb-6">What is the heaviest, most annoying, or most overwhelming thing on your plate right now?</p>

              <textarea
                autoFocus
                aria-label="Identify the weight"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="e.g. The quarterly update presentation I have to give tomorrow..."
                className="w-full h-40 bg-surface dark:bg-surface/50 border border-border/50 rounded-2xl p-6 focus:outline-none focus:border-primary resize-none text-xl text-text-main placeholder-text-muted/60 mb-6 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) {
                    handleAnalyze();
                  }
                }}
              />

              <div className="flex justify-end gap-4">
                <button onClick={handleReset} className="px-6 py-3 font-bold text-text-muted hover:text-text-main transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={!task.trim()}
                  className="btn-primary py-3 px-8 text-lg"
                >
                  <MinusCircle className="w-5 h-5 mr-2" />
                  Remove It
                </button>
              </div>
            </motion.div>
          )}

          {step === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full max-w-xl card p-8 sm:p-12 md:p-16 flex flex-col items-center justify-center text-center border border-border"
            >
              <motion.div
               animate={{ rotate: 360 }}
               transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
               className="w-20 h-20 border-4 border-primary/20 border-t-primary rounded-full mb-8 shrink-0"
              />
              <h3 className="text-3xl font-display font-bold text-text-main mb-4">Nova is thinking...</h3>
              <p className="text-text-muted font-medium text-lg">Finding the fastest way to genuinely take this off your plate.</p>
            </motion.div>
          )}

          {step === 'result' && result && (
             <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-2xl space-y-6"
             >
                <div className={cn("card p-8 md:p-12 relative overflow-hidden border", result.borderClass)}>
                  <div className="relative z-10">
                    <div className="flex items-start gap-6 mb-8">
                      <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center shrink-0 shadow-lg", result.bgColorClass, SOLID_BG_TEXT[result.colorClass] || 'text-white')}>
                        <result.icon className="w-8 h-8" />
                      </div>
                      <div>
                        <span className={cn("text-sm font-black uppercase tracking-widest", CARD_TEXT[result.colorClass] || result.colorClass)}>
                          {result.isFallback ? "Suggested Move" : "Nova's Recommendation"}
                        </span>
                        <h3 className="text-4xl font-display font-bold text-text-main mt-1.5">{result.action} It.</h3>
                      </div>
                    </div>

                    {result.isFallback && (
                      <div className="flex items-center gap-2 text-xs text-text-muted bg-surface dark:bg-surface/50 border border-border rounded-lg px-3 py-2 -mt-4 mb-6">
                        <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        Nova's live analysis wasn't available, so here's the quick version instead.
                      </div>
                    )}

                    <div className="space-y-6">
                      <p className="text-xl font-medium text-text-main leading-relaxed">
                         "{result.advice}"
                      </p>

                      {result.template && (
                        <div className="p-6 bg-surface dark:bg-surface/50 rounded-xl border border-border space-y-3">
                          <span className="text-xs font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                            Communication Template
                          </span>
                          <p className="text-text-main font-medium italic">
                            "{result.template}"
                          </p>
                        </div>
                      )}

                      {/* Let the user pick a different one of the seven
                          outcomes instead, rather than only ever accepting
                          Nova's single suggestion. */}
                      <div className="flex flex-wrap gap-2">
                        {OUTCOME_ORDER.filter((a) => a !== result.action).map((a) => (
                          <button
                            key={a}
                            onClick={() => setResult({ ...result, action: a, ...STYLE_BY_ACTION[a] })}
                            className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text-muted hover:text-text-main hover:border-primary/40 transition-colors"
                          >
                            {a} it instead
                          </button>
                        ))}
                      </div>

                      {/* Connects this outcome into Energy Delta Management
                          (Capacity Protected) instead of leaving One Less
                          Thing as a standalone gimmick. Never shown for
                          "Keep" - no genuine demand has been reduced. */}
                      {result.action !== 'Keep' && (!reducedCapacity ? (
                        <div className="p-5 bg-surface dark:bg-surface/50 rounded-xl border border-border space-y-3">
                          <label htmlFor="one-less-thing-stressor" className="text-xs font-black uppercase tracking-widest text-text-muted block">
                            Is this one of your logged demands?
                          </label>
                          <select
                            id="one-less-thing-stressor"
                            value={selectedStressorId}
                            onChange={(e) => setSelectedStressorId(e.target.value as any)}
                            className="w-full bg-white dark:bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                          >
                            <option value="">Don't connect this</option>
                            {activeStressors.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                            <option value="new">Log "{task.trim().slice(0, 60)}" as a demand I just removed</option>
                          </select>
                          {selectedStressorId && (
                            <button
                              onClick={handleConnectReduction}
                              className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            >
                              Update Capacity Protected
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs font-bold text-success dark:text-[#4ade80]">
                          <CheckCircle2 className="w-4 h-4" /> Capacity Protected updated.
                        </div>
                      ))}

                      {/* ONE LESS THING — DEEPER QUESTIONING */}
                      {showWhyQuestion && !whyAnswered && (
                        <div className="p-5 bg-surface dark:bg-surface/50 rounded-xl border border-border space-y-3">
                          <label className="text-xs font-black uppercase tracking-widest text-text-muted block">
                            Why was this on your plate in the first place?
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {PLATE_REASON_ORDER.map((id) => (
                              <button
                                key={id}
                                onClick={() => handleWhyAnswer(id)}
                                className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text-muted hover:text-text-main hover:border-primary/40 transition-colors"
                              >
                                {PLATE_REASON_LABELS[id]}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {showWhyQuestion && whyAnswered && (
                        <p className="text-xs text-text-muted italic">Noted - Nova will keep this in mind, nothing more.</p>
                      )}
                    </div>

                    <div className="pt-10 flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-border mt-10">
                      <span className="text-sm font-bold text-text-muted flex items-center gap-2">
                         <CheckCircle2 className="w-4 h-4 text-success dark:text-[#4ade80]" /> Nice work, one less thing
                      </span>
                      <button onClick={handleReset} className={cn("rounded-xl px-7 py-3 font-display font-semibold transition-all duration-300 hover:opacity-90", result.bgColorClass, SOLID_BG_TEXT[result.colorClass] || 'text-white')}>
                        Done
                      </button>
                    </div>
                  </div>
                </div>
             </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

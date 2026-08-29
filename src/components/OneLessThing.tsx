import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MinusCircle, Brain, Trash2, Clock, Users, Zap, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface OneLessThingProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type Step = 'initial' | 'input' | 'analyzing' | 'result';

// The four possible outcomes each carry their own destructive/success/
// primary/warning color, but that color behaves differently depending on
// what it sits on. On the solid bgColorClass background, only the
// matching -foreground token is readable (verified: white works for
// destructive/success, dark ink works for primary/warning - using one
// fixed color for all four fails badly on two of them). On a plain card,
// each color has its own light/dark pass-fail pattern already established
// elsewhere this session.
const SOLID_BG_TEXT: Record<string, string> = {
  'text-destructive': 'text-destructive-foreground',
  'text-success': 'text-success-foreground',
  'text-primary': 'text-primary-foreground',
  'text-warning': 'text-warning-foreground',
};
const CARD_TEXT: Record<string, string> = {
  'text-destructive': 'text-destructive dark:text-[#f87171]',
  'text-success': 'text-[#166534] dark:text-[#4ade80]',
  'text-primary': 'text-[#9a3412] dark:text-primary',
  'text-warning': 'text-[#9a3412] dark:text-warning',
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
    // The 'input' step already moves focus itself via the textarea's autoFocus,
    // so this only needs to handle the transitions that don't have a natural
    // focus target (processing, result).
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
  const [result, setResult] = useState<{
    action: 'Delete' | 'Delay' | 'Delegate' | 'Simplify';
    advice: string;
    template?: string;
    icon: any;
    colorClass: string;
    bgColorClass: string;
    borderClass: string;
  } | null>(null);

  const handleAnalyze = () => {
    if (!task.trim()) return;
    setStep('analyzing');
    
    // Simulate Nova analysis based on keywords or random
    setTimeout(() => {
      const lowerTask = task.toLowerCase();
      let outcome;

      if (lowerTask.includes('meeting') || lowerTask.includes('review')) {
        outcome = {
          action: 'Delete',
          advice: "This doesn't need to happen today, and possibly doesn't need to happen at all. Cancel it or ask for an async update.",
          template: "Hi team, I’m re-evaluating priorities for today to protect focus time. Let's handle this update asynchronously via Slack/Email instead of a meeting.",
          icon: Trash2,
          colorClass: "text-destructive",
          bgColorClass: "bg-destructive",
          borderClass: "border-destructive/30"
        };
      } else if (lowerTask.includes('report') || lowerTask.includes('presentation') || lowerTask.includes('deck')) {
        outcome = {
          action: 'Simplify',
          advice: "Lower the fidelity. Stop trying to make it perfect. Give them the rough draft, the bullet points, or the raw data.",
          template: "Here is the raw data / rough outline. I wanted to get this to you quickly rather than over-polishing. Let me know if you need specific details expanded.",
          icon: Zap,
          colorClass: "text-success",
          bgColorClass: "bg-success",
          borderClass: "border-success/30"
        };
      } else if (lowerTask.includes('help') || lowerTask.includes('team') || lowerTask.includes('fix')) {
        outcome = {
          action: 'Delegate',
          advice: "You are hoarding execution. Hand this off. Let someone else solve it at 80% quality instead of you doing it at 100%.",
          template: "Hey, I need to pass this over to you to run with. Do your best with it, no need to run decisions by me unless it's a catastrophic blocker.",
          icon: Users,
          colorClass: "text-primary",
          bgColorClass: "bg-primary",
          borderClass: "border-primary/30"
        };
      } else {
        outcome = {
          action: 'Delay',
          advice: "This is a false emergency. Push it to next week. The business will not collapse.",
          template: "To ensure I can give this the attention it needs, I am going to push my delivery on this to next [Tuesday]. Let me know if that creates a critical blocker.",
          icon: Clock,
          colorClass: "text-warning",
          bgColorClass: "bg-warning",
          borderClass: "border-warning/30"
        };
      }

      setResult(outcome as any);
      setStep('result');
      if (onAwardPoints) onAwardPoints(10, 'Completed One Less Thing');
    }, 2500);
  };

  const handleReset = () => {
    setTask('');
    setResult(null);
    setStep('initial');
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 17 / Emergency Relief</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">The "One Less Thing" Button</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Burnout prevention in one button. When you are overloaded, press this."
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
                <p className="font-medium text-center">Click to initiate reduction protocol.</p>
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
              <h3 className="text-3xl font-display font-bold text-text-main mb-4">Nova is processing...</h3>
              <p className="text-text-muted font-medium text-lg">Finding the structural weakness in this task so you can drop it.</p>
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
                        <span className={cn("text-sm font-black uppercase tracking-widest", CARD_TEXT[result.colorClass] || result.colorClass)}>Nova's Recommendation</span>
                        <h3 className="text-4xl font-display font-bold text-text-main mt-1.5">{result.action} It.</h3>
                      </div>
                    </div>

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
                    </div>

                    <div className="pt-10 flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-border mt-10">
                      <span className="text-sm font-bold text-text-muted flex items-center gap-2">
                         <CheckCircle2 className="w-4 h-4 text-success dark:text-[#4ade80]" /> Nice work, one less thing
                      </span>
                      <button onClick={handleReset} className={cn("rounded-xl px-7 py-3 font-display font-semibold transition-all duration-300 hover:opacity-90", result.bgColorClass, SOLID_BG_TEXT[result.colorClass] || 'text-white')}>
                        Task Removed
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

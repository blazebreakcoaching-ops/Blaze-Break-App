import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Zap, Shield, Flame, CloudFog, Crosshair, Power, AlertTriangle, Wind, Brain, Activity, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface RecoveryRecipesProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type RecipeId = 'sleep' | 'meeting' | 'guilty' | 'angry' | 'numb' | 'focus' | 'switch_off' | 'capacity';

interface Recipe {
  id: RecipeId;
  trigger: string;
  breathwork: string;
  thoughtReset: string;
  bodyReset: string;
  action: string;
  boundary: string;
  icon: any;
  colorClass: string;
  borderClass: string;
  bgTintClass: string;
  bgColorClass: string;
}

const RECIPES: Record<RecipeId, Recipe> = {
  sleep: {
    id: 'sleep',
    trigger: 'I slept badly',
    breathwork: 'Box Breathing: 4s inhale, 4s hold, 4s exhale, 4s hold. (Activates stability).',
    thoughtReset: '"My only goal today is to operate safely at 40% capacity. Perfection is not on the menu."',
    bodyReset: 'Drink 16oz of cold water immediately. Step outside into natural light for 5 minutes.',
    action: 'Scan your task list and immediately drop or delegate one non-critical item.',
    boundary: 'Tell your team: "I am operating on low battery today, so my response times will be slower."',
    icon: Moon,
    colorClass: 'text-primary',
    bgColorClass: 'bg-primary',
    borderClass: 'border-l-primary',
    bgTintClass: 'bg-primary/5'
  },
  meeting: {
    id: 'meeting',
    trigger: 'I had a hard meeting',
    breathwork: 'Physiological Sigh: Double inhale through the nose, long exhale through the mouth. Repeat 3 times.',
    thoughtReset: '"Their urgency or frustration is entirely theirs. I do not have to absorb their panic."',
    bodyReset: 'Stand up. Shake your hands rapidly for 10 seconds. Shake the adrenaline out.',
    action: 'Do not reply to any follow-up emails for at least 30 minutes. Let the physiological spike pass.',
    boundary: 'If asked to jump on another call: "I need 15 minutes to process the last meeting before pivoting."',
    icon: Zap,
    colorClass: 'text-warning',
    bgColorClass: 'bg-warning',
    borderClass: 'border-l-warning',
    bgTintClass: 'bg-warning/5'
  },
  guilty: {
    id: 'guilty',
    trigger: 'I feel guilty resting',
    breathwork: 'Deep belly breathing. Place hand on stomach, ensure only the stomach rises.',
    thoughtReset: '"Recovery is a biological requirement for performance. I am not lazy; I am reloading."',
    bodyReset: 'Lie flat on the floor for 3 minutes. Surrender your physical weight entirely.',
    action: 'Do a zero-output activity for 10 minutes (watch a video, read fiction). Do not optimize it.',
    boundary: 'Put your phone in Do Not Disturb Mode for the next hour.',
    icon: Shield,
    colorClass: 'text-success',
    bgColorClass: 'bg-success',
    borderClass: 'border-l-success',
    bgTintClass: 'bg-success/5'
  },
  angry: {
    id: 'angry',
    trigger: 'I am angry',
    breathwork: 'Lions Breath: Inhale deeply, exhale forcefully with mouth wide open and tongue out.',
    thoughtReset: '"Anger is a signal that a boundary has been crossed. It is giving me information, not a directive to strike."',
    bodyReset: 'Tense every muscle in your body for 5 seconds, then release completely. Repeat twice.',
    action: 'Write down exactly what you want to say to the person. Then delete it immediately without sending.',
    boundary: '"I am not in a productive headspace to discuss this right now. We will revisit this tomorrow at 10 AM."',
    icon: Flame,
    colorClass: 'text-destructive',
    bgColorClass: 'bg-destructive',
    borderClass: 'border-l-destructive',
    bgTintClass: 'bg-destructive/5'
  },
  numb: {
    id: 'numb',
    trigger: 'I am numb',
    breathwork: 'Rapid nasal inhales (breath of fire) for 15 seconds to wake the sympathetic system up gently.',
    thoughtReset: '"Numbness is simply my nervous system pulling the circuit breaker to protect me from overload."',
    bodyReset: 'Splash freezing cold water on your face, or hold an ice cube. Force a sensory reset.',
    action: 'Do one tiny, mechanical task that requires no thought (wipe the desk, organize a folder).',
    boundary: 'Decline all optional social interactions today. Protect the shell.',
    icon: CloudFog,
    colorClass: 'text-text-muted',
    bgColorClass: 'bg-surface',
    borderClass: 'border-l-border',
    bgTintClass: 'bg-surface'
  },
  focus: {
    id: 'focus',
    trigger: 'I cannot focus',
    breathwork: 'Alternate nostril breathing. Balances left/right hemisphere activation.',
    thoughtReset: '"My brain is resisting because the task is either too big or too vague. I need to shrink the scope."',
    bodyReset: 'Stand up and do 10 squats or stretch your arms straight up. Get blood flowing.',
    action: 'Write down ONLY the very next physical action (e.g., "open the document"). Do nothing else.',
    boundary: 'Close all tabs except the one you need. Put the phone in another room.',
    icon: Crosshair,
    colorClass: 'text-primary',
    bgColorClass: 'bg-primary',
    borderClass: 'border-l-primary',
    bgTintClass: 'bg-primary/5'
  },
  switch_off: {
    id: 'switch_off',
    trigger: 'I need to switch off',
    breathwork: 'Extended exhale: Inhale for 4, exhale for 8. Signals safety to the brainstem.',
    thoughtReset: '"There is no remaining crisis that will be solved by me staring at this screen for another hour."',
    bodyReset: 'Physically close the laptop. Step into a different room or take a walk outside the building.',
    action: 'Change your clothes. Create a physical transition away from your "work uniform".',
    boundary: 'Turn off Slack/Email notifications until tomorrow morning. State: "I am offline until tomorrow."',
    icon: Power,
    colorClass: 'text-primary',
    bgColorClass: 'bg-primary',
    borderClass: 'border-l-primary',
    bgTintClass: 'bg-primary/5'
  },
  capacity: {
    id: 'capacity',
    trigger: 'I am over capacity',
    breathwork: 'Inhale and audibly sigh on the exhale. A loud, vocalized drop of tension.',
    thoughtReset: '"If everything is urgent, nothing is urgent. System failure is imminent if I do not drop load."',
    bodyReset: 'Sit down, put your head between your knees, and breathe for 60 seconds.',
    action: 'Cancel or reschedule the next thing on your calendar today. No apologies, just a logistical update.',
    boundary: '"I am currently over capacity and cannot take this on without dropping an existing priority. Which should I drop?"',
    icon: AlertTriangle,
    colorClass: 'text-destructive',
    bgColorClass: 'bg-destructive',
    borderClass: 'border-l-destructive',
    bgTintClass: 'bg-destructive/5'
  }
};

export const RecoveryRecipes = ({ fingerprint, onAwardPoints }: RecoveryRecipesProps) => {
  const [activeRecipe, setActiveRecipe] = useState<RecipeId | null>(null);

  const handleSelectRecipe = (id: RecipeId) => {
    setActiveRecipe(id);
    if (onAwardPoints) onAwardPoints(5, 'Engaged Recovery Recipe');
  };

  const recipe = activeRecipe ? RECIPES[activeRecipe] : null;

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 18 / Practices</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Recovery Recipes</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Like a personalized playlist, but for burnout recovery. Simple. Repeatable. Effective."
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.values(RECIPES)).map((r) => (
          <button
            key={r.id}
            onClick={() => handleSelectRecipe(r.id)}
            className={cn(
               "p-6 rounded-2xl border text-left transition-all group flex flex-col items-center sm:items-start text-center sm:text-left h-full",
               activeRecipe === r.id
                 ? "bg-primary/10 border-primary scale-[1.02] shadow-xl shadow-primary/10"
                 : "border border-transparent hover:border-primary/30 hover:bg-surface dark:hover:bg-surface"
            )}
          >
             <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors", activeRecipe === r.id ? r.bgColorClass + " text-white" : `bg-surface dark:bg-surface ${r.colorClass}`)}>
                <r.icon className="w-6 h-6" />
             </div>
             <span className="font-display font-bold text-lg text-text-main leading-tight">{r.trigger}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {recipe && (
          <motion.div
            key={recipe.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn("card border-l-4 p-8 md:p-12 mt-8", recipe.borderClass, activeRecipe ? recipe.bgTintClass : '')}
          >
            <div className="flex items-center gap-4 mb-10">
              <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center text-white shadow-lg", recipe.bgColorClass)}>
                <recipe.icon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-3xl font-display font-bold text-text-main">"{recipe.trigger}"</h3>
                <p className="text-text-muted font-medium uppercase tracking-widest text-sm mt-1">Recovery Steps</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-8">
                  {/* Breathwork */}
                  <div className="space-y-3 relative group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <Wind className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-text-main uppercase tracking-widest text-sm">One Breathwork Reset</h4>
                    </div>
                    <div className="p-5 bg-white/50 dark:bg-surface/50 rounded-2xl border border-border/50 text-text-main font-medium leading-relaxed group-hover:border-primary/30 transition-colors">
                      {recipe.breathwork}
                    </div>
                  </div>

                  {/* Body Reset */}
                  <div className="space-y-3 relative group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-text-main uppercase tracking-widest text-sm">One Body Reset</h4>
                    </div>
                    <div className="p-5 bg-white/50 dark:bg-surface/50 rounded-2xl border border-border/50 text-text-main font-medium leading-relaxed group-hover:border-success/30 transition-colors">
                      {recipe.bodyReset}
                    </div>
                  </div>
               </div>

               <div className="space-y-8">
                   {/* Thought Reset */}
                  <div className="space-y-3 relative group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <Brain className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-text-main uppercase tracking-widest text-sm">One Thought Reset</h4>
                    </div>
                    <div className="p-5 bg-white/50 dark:bg-surface/50 rounded-2xl border border-border/50 text-text-main font-medium italic leading-relaxed group-hover:border-primary/30 transition-colors">
                      {recipe.thoughtReset}
                    </div>
                  </div>

                  {/* Action */}
                  <div className="space-y-3 relative group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-warning/10 text-warning flex items-center justify-center">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-text-main uppercase tracking-widest text-sm">One Action</h4>
                    </div>
                    <div className="p-5 bg-white/50 dark:bg-surface/50 rounded-2xl border border-border/50 text-text-main font-medium leading-relaxed group-hover:border-warning/30 transition-colors">
                      {recipe.action}
                    </div>
                  </div>
               </div>
            </div>

            <div className="mt-8 pt-8 border-t border-border/50">
               {/* Boundary */}
               <div className="space-y-3 relative group max-w-2xl">
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                     <ShieldCheck className="w-4 h-4" />
                   </div>
                   <h4 className="font-bold text-text-main uppercase tracking-widest text-sm">One Boundary</h4>
                 </div>
                 <div className="p-5 bg-white/50 dark:bg-surface/50 rounded-2xl border border-border/50 text-text-main font-bold leading-relaxed border-l-4 border-l-destructive group-hover:bg-destructive/5 transition-colors">
                   {recipe.boundary}
                 </div>
               </div>
            </div>

            <div className="flex justify-end mt-8">
               <button 
                 onMouseEnter={() => {}}
                 className={cn("btn-primary", recipe.bgColorClass)}
                 onClick={() => {
                   if (onAwardPoints) onAwardPoints(15, `Completed Recipe: ${recipe.trigger}`);
                   setActiveRecipe(null);
                 }}
               >
                 <CheckCircle2 className="w-5 h-5 mr-2" />
                 Got It
               </button>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

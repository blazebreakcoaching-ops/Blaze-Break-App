import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Maximize, User, RefreshCcw, Sun, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface MovementSnacksProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type SnackId = 'neck' | 'walk3' | 'desk' | 'posture' | 'sunlight' | 'shake' | 'decompression';

const M_SNACKS: Record<SnackId, { name: string; description: string; duration: string; icon: any; steps: string[] }> = {
  neck: {
    name: 'Neck/Shoulder Release',
    description: 'Release tension held from screen time.',
    duration: '2 mins',
    icon: User,
    steps: ['Drop shoulders away from ears.', 'Gently tilt left ear to left shoulder.', 'Hold for 3 deep breaths.', 'Repeat on right side.', 'Roll shoulders backward 5 times.']
  },
  walk3: {
    name: '3-Minute Walk',
    description: 'Break the static seated posture.',
    duration: '3 mins',
    icon: Activity,
    steps: ['Stand up immediately.', 'Walk away from your workspace.', 'Keep your eyes looking forward, not down.', 'Focus on the physical sensation of walking.']
  },
  desk: {
    name: 'Desk Stretch',
    description: 'Spinal and overhead extension.',
    duration: '1 min',
    icon: Maximize,
    steps: ['Interlace fingers and reach up to the ceiling.', 'Stretch tall and look up slightly.', 'Lean gently to the left.', 'Lean gently to the right.', 'Release arms with a sigh.']
  },
  posture: {
    name: 'Posture Reset',
    description: 'Realign your physical structure.',
    duration: '30 secs',
    icon: User,
    steps: ['Sit or stand tall.', 'Imagine a string pulling the crown of your head up.', 'Tuck your chin slightly.', 'Expand your chest and take one deep breath.']
  },
  sunlight: {
    name: 'Sunlight Walk',
    description: 'Circadian rhythm anchor.',
    duration: '10 mins',
    icon: Sun,
    steps: ['Step outside explicitly for sunlight.', 'Do not wear sunglasses if safe to do so.', 'Look toward the horizon.', 'Breathe outdoor air deeply.']
  },
  shake: {
    name: 'Shake Off the Meeting',
    description: 'Shed the residual stress of an interaction.',
    duration: '1 min',
    icon: RefreshCcw,
    steps: ['Stand up.', 'Shake your hands vigorously for 10 seconds.', 'Shake your arms.', 'Take a deep breath and "brush off" your shoulders visually.']
  },
  decompression: {
    name: 'After-Work Decompression',
    description: 'The physical boundary between work and life.',
    duration: '15 mins',
    icon: Activity,
    steps: ['Close the laptop physically.', 'Change clothes if possible.', 'Walk around the block or simply do a lap of your home.', 'Declare loudly: "Work is done for today."']
  }
};

export const MovementSnacks = ({ fingerprint, onAwardPoints }: MovementSnacksProps) => {
  const [activeSnack, setActiveSnack] = useState<SnackId | null>(null);
  const [inProgress, setInProgress] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleStart = () => {
    setInProgress(true);
  };

  const handleComplete = () => {
    setInProgress(false);
    setCompleted(true);
    if (onAwardPoints) onAwardPoints(10, 'Executed Movement Snack');
    setTimeout(() => {
      setActiveSnack(null);
      setCompleted(false);
    }, 3000);
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 12 / Movement</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Movement Snacks</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Not gym plans. Not fitness bro punishment. Small physical resets to break tension loops."
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(Object.keys(M_SNACKS) as SnackId[]).map((snackId) => {
           const snack = M_SNACKS[snackId];
           const Icon = snack.icon;
           const isSelected = activeSnack === snackId;

           return (
             <button
               key={snackId}
               onClick={() => {
                 setActiveSnack(snackId);
                 setInProgress(false);
                 setCompleted(false);
               }}
               className={cn(
                 "p-6 rounded-2xl border transition-all text-left group relative overflow-hidden",
                 isSelected
                   ? "bg-success border-success text-white shadow-xl shadow-success/20 scale-[1.02] z-10"
                   : "border border-border hover:border-success/50 text-text-main hover:bg-surface dark:hover:bg-surface"
               )}
             >
               <div className="flex items-center justify-between mb-4 relative z-10">
                 <div className={cn(
                   "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                   isSelected ? "bg-white/20 text-white" : "bg-success/10 text-success"
                 )}>
                   <Icon className="w-5 h-5" />
                 </div>
                 <span className={cn(
                   "text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full",
                   isSelected ? "bg-primary text-primary-foreground" : "bg-surface dark:bg-surface text-text-muted"
                 )}>
                   {snack.duration}
                 </span>
               </div>
               
               <div className="relative z-10 space-y-1">
                 <h4 className={cn("text-xl font-display font-bold", isSelected ? "text-white" : "text-text-main")}>{snack.name}</h4>
                 <p className={cn("text-sm font-medium", isSelected ? "text-success/10" : "text-text-muted")}>{snack.description}</p>
               </div>

               {isSelected && (
                 <motion.div layoutId="snack-highlight" className="absolute inset-0 bg-success/20 blur-xl" />
               )}
             </button>
           );
        })}
      </div>

      <AnimatePresence mode="wait">
        {activeSnack && !completed && (
          <motion.div
            key={activeSnack}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="card border border-success/20 bg-success/5 p-6 sm:p-8 md:p-10 relative overflow-hidden mt-8"
          >
            <div className="relative z-10 space-y-8">
              <div className="space-y-2">
                <h4 className="text-3xl font-display font-bold text-text-main">
                  {M_SNACKS[activeSnack].name}
                </h4>
                <p className="text-lg text-text-muted font-medium">
                  {M_SNACKS[activeSnack].description}
                </p>
              </div>

              <div className="space-y-4 max-w-2xl">
                {M_SNACKS[activeSnack].steps.map((step, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-start gap-4 bg-white/50 dark:bg-surface/50 p-4 rounded-xl border border-border/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-success/20 text-success dark:text-success flex items-center justify-center shrink-0 font-black">
                      {idx + 1}
                    </div>
                    <span className="text-text-main font-bold text-lg leading-tight mt-0.5">{step}</span>
                  </motion.div>
                ))}
              </div>

              <div className="pt-6 flex items-center justify-end border-t border-border/50">
                 {!inProgress ? (
                   <button onClick={handleStart} className="btn-primary bg-success hover:bg-success border-success text-white">
                     <Activity className="w-4 h-4" />
                     Begin Movement
                   </button>
                 ) : (
                   <button onClick={handleComplete} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground">
                     <CheckCircle2 className="w-4 h-4" />
                     Mark as Completed
                   </button>
                 )}
              </div>
            </div>
                      </motion.div>
        )}

        {completed && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card border border-success/20 bg-success/5 p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center text-center py-20 mt-8"
          >
             <div className="w-20 h-20 bg-success rounded-full flex items-center justify-center text-white mb-6 shadow-xl shadow-success/20">
               <CheckCircle2 className="w-10 h-10" />
             </div>
             <h4 className="text-3xl font-display font-bold text-text-main mb-2">Physiology Shifted</h4>
             <p className="text-lg text-text-muted font-medium">Tension loop broken. Recovery points awarded.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

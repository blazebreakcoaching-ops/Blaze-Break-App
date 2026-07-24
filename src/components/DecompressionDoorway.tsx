import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DoorOpen, ArrowRight, Wind, Heart, Brain, Briefcase, Zap, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface DecompressionDoorwayProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type Step = 'roles' | 'carrying' | 'need' | 'breath' | 'intention' | 'complete';

const ROLES = [
  { leave: 'Work Mode', enter: 'Parent Mode', icon: Heart },
  { leave: 'Business Owner', enter: 'Partner Mode', icon: Heart },
  { leave: 'Manager', enter: 'Human Being', icon: Brain },
  { leave: 'Client Chaos', enter: 'Peace Mode', icon: Wind },
  { leave: 'Public Performance', enter: 'Private Recovery', icon: DoorOpen },
];

export const DecompressionDoorway = ({ fingerprint, onAwardPoints }: DecompressionDoorwayProps) => {
  const [step, setStep] = useState<Step>('roles');
  const [selectedRole, setSelectedRole] = useState<{leave: string, enter: string} | null>(null);
  const [carryingItem, setCarryingItem] = useState('');
  const [selectedNeed, setSelectedNeed] = useState<string | null>(null);
  const [intention, setIntention] = useState('');
  
  // Breathwork state
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [breathCycles, setBreathCycles] = useState(0);

  useEffect(() => {
    if (step === 'breath') {
      const cycle = async () => {
        if (breathCycles >= 3) {
          setStep('intention');
          return;
        }

        setBreathPhase('inhale');
        await new Promise(r => setTimeout(r, 4000));
        setBreathPhase('hold');
        await new Promise(r => setTimeout(r, 4000));
        setBreathPhase('exhale');
        await new Promise(r => setTimeout(r, 6000));
        
        setBreathCycles(prev => prev + 1);
      };
      cycle();
    }
  }, [step, breathCycles]);

  const NEEDS = [
    '5 minutes of total silence',
    'A glass of cold water',
    'To change my clothes immediately',
    'To wash my face',
    'A warm hug without talking'
  ];

  const handleComplete = () => {
    setStep('complete');
    if (onAwardPoints) onAwardPoints(15, 'Completed Decompression Doorway');
    setTimeout(() => {
      // Reset after a while
      setStep('roles');
      setSelectedRole(null);
      setCarryingItem('');
      setSelectedNeed(null);
      setIntention('');
      setBreathCycles(0);
    }, 5000);
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 13 / Boundary Transitions</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">The Decompression Doorway</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "We often drag work stress into family life without meaning to. Consciously cross the threshold."
            </p>
          </div>
        </div>
      </div>

      <div className="card glass p-8 md:p-12 min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 'roles' && (
            <motion.div
              key="roles"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl space-y-8"
            >
              <div className="text-center space-y-4 mb-8">
                <div className="w-16 h-16 bg-surface dark:bg-surface rounded-full flex items-center justify-center mx-auto mb-6">
                  <DoorOpen className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-3xl font-display font-bold text-text-main">What thresholds are you crossing?</h3>
                <p className="text-text-muted">Select the transition you need to make right now.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {ROLES.map((role, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedRole(role);
                      setStep('carrying');
                    }}
                    className="flex justify-between items-center p-6 rounded-2xl glass border-transparent hover:border-primary/50 hover:bg-surface dark:bg-card dark:hover:bg-surface/50 transition-all group group-hover:scale-[1.01]"
                  >
                    <div className="flex items-center gap-6 flex-1">
                      <div className="flex-1 text-right">
                        <span className="text-sm font-black uppercase tracking-widest text-text-muted">Leaving Behind</span>
                        <p className="text-xl font-bold text-text-main">{role.leave}</p>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-surface dark:bg-surface flex items-center justify-center shrink-0">
                        <ArrowRight className="w-5 h-5 text-primary group-hover:translate-x-1 transition-transform" />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-black uppercase tracking-widest text-primary">Entering Into</span>
                        <p className="text-xl font-bold text-primary dark:text-primary">{role.enter}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'carrying' && (
            <motion.div
              key="carrying"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-xl space-y-8"
            >
               <div className="text-center space-y-4 mb-8">
                <div className="w-16 h-16 bg-surface dark:bg-surface rounded-full flex items-center justify-center mx-auto mb-6">
                  <Briefcase className="w-8 h-8 text-warning" />
                </div>
                <h3 className="text-3xl font-display font-bold text-text-main">What are you carrying?</h3>
                <p className="text-text-muted">Extract the residual stress. Name it so you don't take it inside.</p>
              </div>

              <div className="space-y-6">
                <textarea
                  value={carryingItem}
                  onChange={(e) => setCarryingItem(e.target.value)}
                  placeholder="e.g. Frustration from that meeting, anxiety about tomorrow's deadline..."
                  className="w-full h-32 bg-surface dark:bg-surface/50 border border-border/50 rounded-2xl p-6 focus:outline-none focus:border-warning resize-none text-lg text-text-main placeholder-text-muted/60"
                />
                <button
                  onClick={() => setStep('need')}
                  disabled={!carryingItem.trim()}
                  className="w-full btn-primary bg-warning hover:bg-warning border-warning py-4 text-lg disabled:opacity-50"
                >
                  Leave It Outside <ArrowRight className="w-5 h-5 ml-2" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'need' && (
             <motion.div
               key="need"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="w-full max-w-xl space-y-8"
             >
                <div className="text-center space-y-4 mb-8">
                 <div className="w-16 h-16 bg-surface dark:bg-surface rounded-full flex items-center justify-center mx-auto mb-6">
                   <Zap className="w-8 h-8 text-success" />
                 </div>
                 <h3 className="text-3xl font-display font-bold text-text-main">What do you need?</h3>
                 <p className="text-text-muted">Identify what you require before bridging the gap.</p>
               </div>
 
               <div className="space-y-3">
                 {NEEDS.map((need, idx) => (
                   <button
                     key={idx}
                     onClick={() => setSelectedNeed(need)}
                     className={cn(
                       "w-full text-left p-4 rounded-xl border transition-all font-bold text-lg",
                       selectedNeed === need 
                         ? "bg-success/10 border-success text-success dark:text-success scale-[1.01]"
                         : "glass border-transparent hover:border-success/50 text-text-main"
                     )}
                   >
                     {need}
                   </button>
                 ))}
               </div>
               
               <button
                  onClick={() => setStep('breath')}
                  disabled={!selectedNeed}
                  className="w-full btn-primary bg-success hover:bg-success border-success py-4 text-lg disabled:opacity-50 mt-4"
                >
                  Proceed to Reset <ArrowRight className="w-5 h-5 ml-2" />
                </button>
             </motion.div>
          )}

          {step === 'breath' && (
             <motion.div
               key="breath"
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 1.1 }}
               className="w-full flex flex-col items-center justify-center py-12"
             >
                <div className="text-center space-y-4 mb-16">
                 <h3 className="text-3xl font-display font-bold text-text-main">Cleanse the System</h3>
                 <p className="text-text-muted">3 cycles of physiological reset. Follow the guide.</p>
               </div>

                <div className="relative w-64 h-64 flex items-center justify-center mb-12">
                   <motion.div
                     className="absolute inset-0 bg-primary/20 rounded-full blur-2xl"
                     animate={{ 
                       scale: breathPhase === 'inhale' ? 1.5 : breathPhase === 'exhale' ? 1 : 1.5,
                       opacity: breathPhase === 'hold' ? 0.8 : 0.5 
                     }}
                     transition={{ duration: breathPhase === 'exhale' ? 6 : 4, ease: 'easeInOut' }}
                   />
                   <motion.div
                     className="w-16 h-16 bg-primary rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center relative z-10"
                     animate={{ 
                       scale: breathPhase === 'inhale' ? 2 : breathPhase === 'exhale' ? 1 : 2 
                     }}
                     transition={{ duration: breathPhase === 'exhale' ? 6 : 4, ease: 'easeInOut' }}
                   >
                     <Wind className="w-6 h-6 text-text-main" />
                   </motion.div>
                   <div className="absolute inset-0 border border-primary/20 rounded-full scale-[1.5]" />
                   <div className="absolute inset-0 border border-primary/10 rounded-full scale-[2]" />
                   
                   <div className="absolute -bottom-16 w-full text-center">
                      <span className="text-2xl font-black uppercase tracking-[0.2em] text-primary">
                        {breathPhase === 'inhale' && "Inhale"}
                        {breathPhase === 'hold' && "Hold"}
                        {breathPhase === 'exhale' && "Exhale"}
                      </span>
                      <p className="text-sm font-medium text-text-muted mt-2">Cycle {breathCycles + 1} of 3</p>
                   </div>
                 </div>
             </motion.div>
          )}

          {step === 'intention' && (
             <motion.div
              key="intention"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-xl space-y-8"
            >
               <div className="text-center space-y-4 mb-8">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6 text-primary-foreground shadow-lg shadow-primary/20">
                  <DoorOpen className="w-8 h-8" />
                </div>
                <h3 className="text-3xl font-display font-bold text-text-main">Set the Intention</h3>
                <p className="text-text-muted">You are now in {selectedRole?.enter}. How will you show up?</p>
              </div>

              <div className="space-y-6">
                <div className="p-6 bg-primary/10 border border-primary/20 rounded-2xl">
                  <p className="text-lg font-medium text-primary dark:text-primary italic">
                    "I am leaving {selectedRole?.leave} behind. I am stepping into {selectedRole?.enter}."
                  </p>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-black uppercase tracking-widest text-text-muted">My focus for the next 2 hours is:</span>
                  <input
                    type="text"
                    value={intention}
                    onChange={(e) => setIntention(e.target.value)}
                    placeholder="e.g. Being fully present with my kids..."
                    className="w-full bg-surface dark:bg-surface/50 border border-border/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-lg text-text-main"
                  />
                </label>
                <button
                  onClick={handleComplete}
                  disabled={!intention.trim()}
                  className="w-full btn-primary py-4 text-lg disabled:opacity-50"
                >
                  Cross the Threshold
                </button>
              </div>
            </motion.div>
          )}

          {step === 'complete' && (
            <motion.div
             key="complete"
             initial={{ opacity: 0, scale: 0.9 }}
             animate={{ opacity: 1, scale: 1 }}
             className="w-full flex justify-center py-20"
            >
              <div className="text-center p-12 border border-success/20 bg-success/5 rounded-3xl">
                <div className="w-24 h-24 bg-success rounded-full flex items-center justify-center text-white mb-8 shadow-xl shadow-success/20 mx-auto">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h4 className="text-4xl font-display font-bold text-text-main mb-4">Threshold Crossed</h4>
                <p className="text-xl text-text-muted font-medium mb-2">You are now in {selectedRole?.enter}.</p>
                <p className="text-success dark:text-success font-bold uppercase tracking-widest text-sm mt-8">Complete</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

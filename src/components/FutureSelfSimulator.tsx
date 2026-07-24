import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Calendar, Moon, Battery, Activity, ArrowRight, Shield, Zap, RefreshCw, X, Play, Clock, Heart } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface FutureSelfSimulatorProps {
  fingerprint: BurnoutFingerprint | null;
}

export const FutureSelfSimulator = ({ fingerprint }: FutureSelfSimulatorProps) => {
  const [step, setStep] = useState<'input' | 'processing' | 'simulation'>('input');
  
  const [inputs, setInputs] = useState({
    meetings: 15,
    sleep: 2, // 1 Poor, 2 Fair, 3 Good
    energy: 40, // 0-100
    pressure: 3, // 1 Low, 2 Med, 3 High
    emotional: 2, // 1 Low, 2 Med, 3 High
    recoveryTime: 15 // minutes 0-120
  });

  const [appliedScenarios, setAppliedScenarios] = useState<string[]>([]);

  const handleSimulate = () => {
    setStep('processing');
    setTimeout(() => {
      setStep('simulation');
    }, 2000);
  };

  const getDayRiskStatus = (baseDayOffset: number, mitigatingFactorsCount: number) => {
    // A simple mock curve: baseline keeps going up (worse) over 7 days.
    // Mitigations pull it down.
    
    // baseline risk from 0 to 10
    let baseRisk = 3 + (inputs.meetings > 20 ? 2 : 0) + (inputs.sleep === 1 ? 2 : 0) + (inputs.pressure === 3 ? 2 : 0);
    // risk increases each day
    let dailyRisk = baseRisk + (baseDayOffset * 1.5);
    // subtract mitigations
    dailyRisk -= (mitigatingFactorsCount * 2);

    if (dailyRisk > 8) return 'red';
    if (dailyRisk > 5) return 'amber';
    return 'green';
  };

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  const scenarios = [
    { id: 'move_meeting', label: "Move one meeting", icon: Calendar, effect: "Reduces structural load." },
    { id: 'add_recovery', label: "Add 30m recovery", icon: Clock, effect: "Increases baseline capacity." },
    { id: 'delay_task', label: "Delay non-urgent task", icon: Zap, effect: "Reduces cognitive pressure." },
    { id: 'protect_lunch', label: "Protect lunch hour", icon: Shield, effect: "Creates required decompression gap." },
    { id: 'boundary_msg', label: "Send boundary message", icon: Activity, effect: "Stops external siphoning." },
    { id: 'ns_reset', label: "Nervous System Reset", icon: Heart, effect: "Discharges trapped cortisol." }
  ];

  const handleToggleScenario = (id: string) => {
    if (appliedScenarios.includes(id)) {
      setAppliedScenarios(appliedScenarios.filter(s => s !== id));
    } else {
      setAppliedScenarios([...appliedScenarios, id]);
    }
  };

  const isMitigated = appliedScenarios.length > 2;
  const currentRiskColor = isMitigated ? 'text-warning' : 'text-destructive';

  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <h2 className="text-3xl lg:text-4xl font-display font-bold text-text-main flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          Nova Future-Self Simulator
        </h2>
        <p className="text-text-muted text-lg max-w-2xl font-medium leading-relaxed">
          See where your week is heading before burnout gets there first. Nova forecasts your systemic load and simulates alternative timelines.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {step === 'input' && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="card p-8 lg:p-12 space-y-12"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-8">
                <div className="space-y-2 border-b border-border pb-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-text-main flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Current State
                  </h3>
                  <p className="text-sm text-text-muted">Input your baseline metrics to run the simulation.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                     <div className="flex justify-between text-xs font-bold text-text-main">
                        <label>Expected Meetings</label>
                        <span>{inputs.meetings}</span>
                     </div>
                     <input type="range" min="0" max="40" value={inputs.meetings} onChange={(e) => setInputs({...inputs, meetings: parseInt(e.target.value)})} className="w-full accent-primary" />
                  </div>
                  
                  <div className="space-y-2">
                     <div className="flex justify-between text-xs font-bold text-text-main">
                        <label>Current Energy Battery</label>
                        <span>{inputs.energy}%</span>
                     </div>
                     <input type="range" min="1" max="100" value={inputs.energy} onChange={(e) => setInputs({...inputs, energy: parseInt(e.target.value)})} className="w-full accent-primary" />
                  </div>

                  <div className="space-y-2">
                     <div className="flex justify-between text-xs font-bold text-text-main">
                        <label>Daily Recovery Time Available</label>
                        <span>{inputs.recoveryTime} min</span>
                     </div>
                     <input type="range" min="0" max="120" step="5" value={inputs.recoveryTime} onChange={(e) => setInputs({...inputs, recoveryTime: parseInt(e.target.value)})} className="w-full accent-primary" />
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="space-y-2 border-b border-border pb-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-transparent opacity-0 select-none hidden lg:block">-</h3>
                  <p className="text-sm text-text-muted hidden lg:block">&nbsp;</p>
                </div>

                <div className="space-y-6">
                   <div className="space-y-2">
                     <label className="text-xs font-bold text-text-main block">Sleep Quality</label>
                     <div className="grid grid-cols-3 gap-2">
                       {['Poor', 'Fair', 'Good'].map((label, i) => (
                         <button 
                           key={label}
                           onClick={() => setInputs({...inputs, sleep: i + 1})}
                           className={cn("py-2 text-xs font-bold rounded-lg border transition-all", inputs.sleep === i + 1 ? "bg-primary border-primary text-primary-foreground" : "border-border text-text-muted hover:border-primary/30")}
                         >
                           {label}
                         </button>
                       ))}
                     </div>
                   </div>

                   <div className="space-y-2">
                     <label className="text-xs font-bold text-text-main block">Workload Pressure</label>
                     <div className="grid grid-cols-3 gap-2">
                       {['Low', 'Medium', 'High'].map((label, i) => (
                         <button 
                           key={label}
                           onClick={() => setInputs({...inputs, pressure: i + 1})}
                           className={cn("py-2 text-xs font-bold rounded-lg border transition-all", inputs.pressure === i + 1 ? "bg-warning border-warning text-warning-foreground" : "border-border text-text-muted hover:border-warning/30")}
                         >
                           {label}
                         </button>
                       ))}
                     </div>
                   </div>

                   <div className="space-y-2">
                     <label className="text-xs font-bold text-text-main block">Emotional Load</label>
                     <div className="grid grid-cols-3 gap-2">
                       {['Low', 'Medium', 'High'].map((label, i) => (
                         <button 
                           key={label}
                           onClick={() => setInputs({...inputs, emotional: i + 1})}
                           className={cn("py-2 text-xs font-bold rounded-lg border transition-all", inputs.emotional === i + 1 ? "bg-destructive border-destructive text-destructive-foreground" : "border-border text-text-muted hover:border-destructive/30")}
                         >
                           {label}
                         </button>
                       ))}
                     </div>
                   </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-border">
              <button onClick={handleSimulate} className="btn-primary group flex items-center justify-center gap-3 px-8 py-4 rounded-xl uppercase tracking-widest text-xs">
                Run Simulation <Play className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-32 space-y-6 card"
          >
            <RefreshCw className="w-12 h-12 text-primary animate-spin" />
            <h3 className="text-xl font-display font-bold animate-pulse text-text-main">Running Future-Self Prognostics...</h3>
            <p className="text-text-muted font-mono text-sm max-w-sm text-center">
              Analyzing metadata... Calculating trajectory variance... Mapping neural fatigue probability vectors...
            </p>
          </motion.div>
        )}

        {step === 'simulation' && (
          <motion.div
            key="simulation"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
             {/* Path A vs B Header */}
             <div className="card p-8 bg-card border-destructive/20 text-text-main relative overflow-hidden">
                <div className="absolute right-0 top-0 w-64 h-64 bg-destructive/10 blur-3xl rounded-full" />
                <div className="relative z-10 space-y-6">
                   <div className="flex items-center gap-3">
                     <Zap className={cn("w-6 h-6", currentRiskColor)} />
                     <h3 className="text-2xl font-bold font-display uppercase tracking-widest text-text-main">
                       Path {isMitigated ? 'B' : 'A'}: {isMitigated ? 'Protected Week' : 'Current Week'}
                     </h3>
                   </div>
                   
                   <p className="text-xl leading-relaxed text-text-muted font-medium italic">
                     {isMitigated 
                       ? `"With these changes, your overload risk drops from critical red to manageable amber. Structural failure averted."`
                       : `"If you continue this week exactly as planned, your overload risk rises to critical by Thursday."`
                     }
                   </p>

                   <div className="flex items-center gap-4 text-sm font-bold text-text-muted p-4 bg-black/20 rounded-xl">
                      <Shield className="w-5 h-5 text-warning" />
                      <span>{isMitigated 
                        ? 'Root causes addressed: Neural gap secured, boundary established.' 
                        : 'Root causes building: Too many meetings, low baseline energy, insufficient recovery windows.'}
                      </span>
                   </div>
                </div>
             </div>

             {/* 7-Day Forecast */}
             <div className="space-y-4">
               <h4 className="text-sm font-black uppercase tracking-widest text-text-main">7-Day Burnout Forecast</h4>
               <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
                 {days.map((day, i) => {
                   const risk = getDayRiskStatus(i, appliedScenarios.length);
                   return (
                     <div key={day} className={cn(
                       "relative p-4 rounded-2xl border transition-all duration-500 overflow-hidden flex flex-col justify-between h-32 lg:h-40",
                       risk === 'red' ? "bg-rose-50 border-rose-200 dark:bg-destructive/10 dark:border-destructive/20" :
                       risk === 'amber' ? "bg-warning/10 border-warning/30 dark:bg-warning/10 dark:border-warning/20" :
                       "bg-success/10 border-success/30 dark:bg-success/10 dark:border-success/20"
                     )}>
                        <h5 className="text-lg font-bold text-text-main">{day}</h5>
                        <div className="space-y-1">
                          <span className={cn(
                            "text-xs font-black uppercase tracking-widest",
                            risk === 'red' ? "text-rose-600 dark:text-destructive" :
                            risk === 'amber' ? "text-warning dark:text-warning" :
                            "text-success dark:text-success"
                          )}>
                            {risk === 'red' ? 'Overload' : risk === 'amber' ? 'Pressure' : 'Manageable'}
                          </span>
                          <div className="flex gap-1 h-1.5">
                             <div className={cn("flex-1 rounded-full", risk === 'red' ? 'bg-destructive' : risk === 'amber' ? 'bg-warning' : 'bg-success')} />
                             <div className={cn("flex-1 rounded-full", risk === 'red' ? 'bg-destructive' : risk === 'amber' ? 'bg-warning' : 'bg-success/20')} />
                             <div className={cn("flex-1 rounded-full", risk === 'red' ? 'bg-destructive' : 'bg-warning/20 opacity-50 dark:opacity-20')} />
                          </div>
                        </div>
                     </div>
                   );
                 })}
               </div>
             </div>

             {/* Scenario Testing */}
             <div className="card p-8 lg:p-10 space-y-8 bg-surface dark:bg-card border-none">
               <div className="flex items-center justify-between">
                 <div>
                   <h4 className="text-xl font-bold font-display text-text-main">Scenario Testing</h4>
                   <p className="text-sm text-text-muted mt-1">Tap actions to apply proactive mitigation and watch the forecast update.</p>
                 </div>
                 {appliedScenarios.length > 0 && (
                   <button onClick={() => setAppliedScenarios([])} className="text-xs font-bold text-text-muted hover:text-primary transition-colors flex items-center gap-2">
                     <RefreshCw className="w-3 h-3" /> Reset Scenarios
                   </button>
                 )}
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {scenarios.map((scenario) => {
                   const isActive = appliedScenarios.includes(scenario.id);
                   return (
                     <button
                       key={scenario.id}
                       onClick={() => handleToggleScenario(scenario.id)}
                       className={cn(
                         "group p-4 rounded-xl border text-left transition-all duration-300 flex items-start gap-4",
                         isActive 
                           ? "bg-primary border-primary text-primary-foreground shadow-xl shadow-primary/20 scale-[1.02]" 
                           : "bg-white dark:bg-surface border-border hover:border-primary/40"
                       )}
                     >
                       <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors", isActive ? "bg-white/20" : "bg-surface dark:bg-surface text-primary")}>
                         <scenario.icon className="w-5 h-5" />
                       </div>
                       <div>
                         <h5 className={cn("text-sm font-bold", isActive ? "text-primary-foreground" : "text-text-main")}>{scenario.label}</h5>
                         <p className={cn("text-xs mt-1 font-medium", isActive ? "text-primary-foreground/80" : "text-text-muted")}>{scenario.effect}</p>
                       </div>
                       {isActive && <div className="ml-auto flex items-center justify-center w-6 h-6 bg-white rounded-full text-primary"><X className="w-4 h-4" /></div>}
                     </button>
                   );
                 })}
               </div>
             </div>

             {/* Protected Week Plan & Future-Self Msg */}
             <AnimatePresence>
               {isMitigated && (
                 <motion.div
                   initial={{ opacity: 0, height: 0 }}
                   animate={{ opacity: 1, height: 'auto' }}
                   className="space-y-8 pt-8 overflow-hidden"
                 >
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="card p-8 border-success/20 bg-success/10 dark:bg-success-foreground/10 relative overflow-hidden">
                        <h4 className="text-sm font-black uppercase tracking-widest text-success dark:text-success mb-6 flex items-center gap-2">
                          <Activity className="w-5 h-5" /> Protected Week Plan
                        </h4>
                        <ul className="space-y-4">
                          <li className="flex gap-3">
                            <span className="text-success font-bold w-16 shrink-0 uppercase tracking-wider text-xs mt-1">Keep</span>
                            <span className="text-sm text-text-main font-medium">Your non-negotiable strategic blocks.</span>
                          </li>
                          <li className="flex gap-3">
                            <span className="text-success font-bold w-16 shrink-0 uppercase tracking-wider text-xs mt-1">Move</span>
                            <span className="text-sm text-text-main font-medium">One status update meeting to async.</span>
                          </li>
                          <li className="flex gap-3">
                            <span className="text-success font-bold w-16 shrink-0 uppercase tracking-wider text-xs mt-1">Recover</span>
                            <span className="text-sm text-text-main font-medium">Add 30m hard-stop decompression cycle at 5:30 PM.</span>
                          </li>
                          <li className="flex gap-3">
                            <span className="text-success font-bold w-16 shrink-0 uppercase tracking-wider text-xs mt-1">Say</span>
                            <span className="text-sm text-text-main font-medium italic">"I’m capturing this for Monday’s triage to protect my focus block today."</span>
                          </li>
                        </ul>
                      </div>

                      <div className="card p-8 bg-card border-none text-text-main flex flex-col justify-center">
                         <h4 className="text-sm font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2 mb-auto">
                          <Sparkles className="w-5 h-5" /> From Future You
                        </h4>
                        <p className="text-xl md:text-2xl font-serif italic text-text-muted leading-relaxed max-w-sm ml-4 border-l-2 border-primary pl-6 py-2">
                          "Future You does not need you to prove anything today. Future You needs you to remove one thing before the week becomes too heavy."
                        </p>
                      </div>
                   </div>

                   <button onClick={() => setStep('input')} className="text-sm font-bold text-text-muted hover:text-primary transition-colors flex items-center gap-2 mx-auto">
                     <ArrowRight className="w-4 h-4 rotate-180" /> Run another simulation
                   </button>
                 </motion.div>
               )}
             </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

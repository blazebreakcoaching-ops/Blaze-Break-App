import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Brain, ArrowRight, AlertOctagon, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface ResentmentTrackerProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
}

export const ResentmentTracker = ({ fingerprint, onAwardPoints, onNavigate }: ResentmentTrackerProps) => {
  const [log, setLog] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<null | {
    yesMeantNo: string;
    unappreciated: string;
    unclear: string;
    missingBoundary: string;
  }>(null);

  const handleAnalyze = () => {
    if (!log.trim()) return;
    setIsAnalyzing(true);
    
    // Simulate AI analysis delay
    setTimeout(() => {
      setIsAnalyzing(false);
      setAnalysis({
        yesMeantNo: "You likely agreed to handle this outside of your core responsibilities because it felt faster than pushing back.",
        unappreciated: "The effort required remains invisible to the requestor, creating an emotional deficit.",
        unclear: "The standard operating procedure for this task is vaguely defined, making you the default fail-safe.",
        missingBoundary: "A structural 'No' or a 'Not right now' protocol."
      });
    }, 2000);
  };

  const handleReset = () => {
    setLog('');
    setAnalysis(null);
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 15 / Emotional Metrics</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Resentment Tracker</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Resentment is often a sign of repeated boundary failure."
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Input Section */}
        <div className="space-y-6">
          <div className="card glass p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                <Flame className="w-5 h-5" />
              </div>
              <h3 className="text-2xl font-display font-bold text-text-main">Log the Friction</h3>
            </div>
            
            <p className="text-text-muted mb-4 font-medium">
              What is currently annoying you? Be unprofessional. Be petty. Just get it out.
            </p>
            
            <textarea
              value={log}
              onChange={(e) => setLog(e.target.value)}
              placeholder="I feel annoyed because..."
              className="w-full h-48 bg-surface dark:bg-surface/50 border border-border/50 rounded-2xl p-6 focus:outline-none focus:border-destructive resize-none text-lg text-text-main placeholder-text-muted/60 mb-6 transition-colors"
              disabled={isAnalyzing || analysis !== null}
            />

            {!analysis && (
              <button
                onClick={handleAnalyze}
                disabled={!log.trim() || isAnalyzing}
                className="w-full btn-primary bg-destructive hover:bg-destructive-foreground hover:bg-opacity-90 border-destructive py-4 text-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <Brain className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <Brain className="w-5 h-5" />
                )}
                {isAnalyzing ? "Nova is Analyzing Patterns..." : "Analyze the Resentment"}
              </button>
            )}
            
            {analysis && (
              <button
                onClick={handleReset}
                className="w-full btn-primary bg-border hover:bg-surface dark:bg-surface dark:hover:bg-surface border-transparent text-text-main py-4 text-lg"
              >
                Log Another Incident
              </button>
            )}
          </div>
        </div>

        {/* Output Section */}
        <div className="space-y-6">
           <AnimatePresence mode="wait">
             {!analysis && !isAnalyzing && (
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-border/50 rounded-3xl p-8 text-center text-text-muted "
               >
                 <AlertOctagon className="w-12 h-12 mb-4 opacity-50" />
                 <p className="font-display font-bold text-xl">Awaiting Data</p>
                 <p className="text-sm mt-2 max-w-xs">Nova needs raw input to detect structural boundary failures.</p>
               </motion.div>
             )}

             {analysis && (
               <motion.div
                 key="analysis"
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="card glass border-primary/20 bg-primary/5 p-8 relative overflow-hidden h-full"
               >
                 <div className="relative z-10 space-y-8">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
                       <Brain className="w-4 h-4" />
                     </div>
                     <div>
                       <h3 className="text-sm font-display font-bold text-text-main tracking-tight">Nova's Diagnosis</h3>
                       <p className="text-[11px] uppercase tracking-[0.2em] font-black text-primary">Root Cause Extraction</p>
                     </div>
                   </div>

                   <div className="space-y-6">
                     <div className="space-y-2">
                       <h4 className="text-xs font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                         Where you said yes but meant no
                       </h4>
                       <p className="text-text-main font-medium">{analysis.yesMeantNo}</p>
                     </div>

                     <div className="space-y-2">
                       <h4 className="text-xs font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                         Where expectations are unclear
                       </h4>
                       <p className="text-text-main font-medium">{analysis.unclear}</p>
                     </div>

                     <div className="space-y-2">
                       <h4 className="text-xs font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                         Feeling unappreciated
                       </h4>
                       <p className="text-text-main font-medium">{analysis.unappreciated}</p>
                     </div>

                     <div className="space-y-2 p-4 bg-primary/10 border border-primary/20 rounded-xl">
                       <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-2">
                         <ShieldAlert className="w-4 h-4" />
                         The Missing Boundary
                       </h4>
                       <p className="text-text-main font-bold text-lg">{analysis.missingBoundary}</p>
                     </div>
                   </div>

                   <div className="pt-6 border-t border-border/50">
                     <button
                       onClick={() => {
                         if (onNavigate) onNavigate('communicate');
                       }}
                       className="w-full btn-primary flex items-center justify-between group py-4"
                     >
                       <span>Proceed to Boundary Rehearsal</span>
                       <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                     </button>
                   </div>
                 </div>
                 <div className="absolute right-[-10%] top-[-10%] w-64 h-64 bg-primary/10 rounded-full blur-[80px]" />
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

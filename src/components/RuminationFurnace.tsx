import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Wind, CheckCircle2, RotateCcw, AlertTriangle, Cpu, TerminalSquare } from 'lucide-react';
import { cn } from '../lib/utils';

export const RuminationFurnace = ({ onCleared }: { onCleared?: () => void }) => {
  const [input, setInput] = useState('');
  const [isBurning, setIsBurning] = useState(false);
  const [complete, setComplete] = useState(false);

  const handleBurn = () => {
    if (!input.trim()) return;
    setIsBurning(true);
    
    // Simulate burning process
    setTimeout(() => {
      setIsBurning(false);
      setComplete(true);
      setInput('');
      if (onCleared) onCleared();
    }, 2800);
  };

  const handleReset = () => {
    setComplete(false);
  };

  if (complete) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="card bg-background border border-white/[0.05] p-16 text-center flex flex-col items-center justify-center space-y-8 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')] opacity-10 pointer-events-none" />
        
        <div className="w-24 h-24 bg-white/[0.02] border border-white/[0.05] rounded-full flex items-center justify-center shadow-inner relative z-10">
          <Wind className="w-10 h-10 text-text-muted" />
        </div>
        
        <div className="relative z-10 space-y-3 max-w-md">
          <h3 className="text-3xl font-display font-medium text-text-main tracking-tight">Vented to the Void</h3>
          <p className="text-text-muted leading-relaxed max-w-sm mx-auto">
            The neural pattern has been forcefully dispersed. It no longer holds structural weight in your energy budget.
          </p>
        </div>
        
        <button 
          onClick={handleReset} 
          className="relative z-10 text-xs font-black uppercase tracking-[0.2em] text-text-muted hover:text-text-main flex items-center gap-2 transition-colors px-6 py-3 rounded-full hover:bg-white/[0.02] border border-transparent hover:border-white/[0.05]"
        >
          <RotateCcw className="w-3 h-3" /> Reinitialize Protocol
        </button>
      </motion.div>
    );
  }

  return (
    <div className="card bg-background border-white/[0.05] p-10 lg:p-14 text-text-main relative overflow-hidden group shadow-2xl">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')] opacity-10 pointer-events-none" />
      
      {/* Dynamic Background Glow */}
      <div className={cn(
        "absolute top-0 right-0 p-6 flex opacity-20 transition-all duration-1000 transform pointer-events-none",
        isBurning ? "scale-[3] opacity-60 mix-blend-screen" : "scale-100"
      )}>
        <Flame className={cn("w-64 h-64 blur-[80px]", isBurning ? "text-destructive" : "text-warning")} />
      </div>

      <div className="relative z-10 max-w-3xl space-y-10 mx-auto">
        <div className="space-y-6 text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/10 to-rose-500/10 border border-warning/20 text-warning text-xs uppercase shadow-inner mb-2">
            <Flame className="w-8 h-8" />
          </div>
          <div className="space-y-4">
            <h3 className="text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-text-main">The Rumination Furnace</h3>
            <p className="text-text-muted leading-relaxed max-w-xl text-center mx-auto text-sm lg:text-base">
              Transfer the recurring neural loop perfectly out of your system. The anger, the hypothetical arguments, the frustration. Render it as raw text. We will execute a hard incineration.
            </p>
          </div>
        </div>

        <div className="relative pt-4">
          <div className="absolute -left-4 top-4 bottom-4 w-[2px] bg-gradient-to-b from-amber-500/0 via-amber-500/50 to-rose-500/0 opacity-50" />
          
          <div className="flex items-center gap-2 mb-3">
             <TerminalSquare className="w-4 h-4 text-text-muted" />
             <span className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">Volatile Memory Buffer</span>
          </div>
          
          <div className="relative overflow-hidden rounded-2xl bg-surface/80 border border-white/10 group/input">
            <AnimatePresence>
              {isBurning && (
                <motion.div
                  initial={{ opacity: 0, bottom: -100 }}
                  animate={{ opacity: 1, bottom: -20 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2.5, ease: 'easeIn' }}
                  className="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-rose-600 via-amber-500/80 to-transparent z-20 mix-blend-color-dodge rounded-b-2xl pointer-events-none blur-xl"
                />
              )}
            </AnimatePresence>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isBurning}
              placeholder="Dump the neural pattern here. e.g., 'I am furious that my Saturday boundary was crossed again...'"
              className={cn(
                "w-full h-56 bg-transparent p-6 text-lg lg:text-xl font-medium placeholder-slate-700 focus:outline-none resize-none transition-all duration-700 relative z-10",
                isBurning ? "text-warning grayscale opacity-30" : "text-white"
              )}
              style={{
                filter: isBurning ? 'blur(4px)' : 'none',
              }}
            />
            
            <AnimatePresence>
               {isBurning && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="absolute inset-0 flex flex-col items-center justify-center z-30"
                  >
                    <Flame className="w-20 h-20 text-text-main animate-pulse" />
                    <span className="text-xs font-black uppercase tracking-[0.3em] text-text-main mt-4 drop-shadow-md">Incinerating Vector...</span>
                  </motion.div>
               )}
            </AnimatePresence>
          </div>
        </div>

        <button
          onClick={handleBurn}
          disabled={!input.trim() || isBurning}
          className="w-full relative overflow-hidden group/btn py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] bg-surface dark:bg-card text-text-main disabled: disabled:cursor-not-allowed transition-all hover:bg-border"
        >
          <span className="relative z-10 flex items-center justify-center gap-3">
            {isBurning ? 'Purging Core Limits...' : 'Execute Hard Incineration'}
            {!isBurning && <Flame className="w-4 h-4" />}
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-rose-600 opacity-0 group-hover/btn:opacity-20 transition-opacity" />
        </button>
      </div>
    </div>
  );
};

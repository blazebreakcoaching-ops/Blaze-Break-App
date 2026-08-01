import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartPulse, Check, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';

interface SomaticCheckInCardProps {
  onAwardPoints: (amount: number, reason: string) => void;
  onUpdateOperationalMetrics: (energy: number, risk: string) => void;
  onUpdatePulseHistory: (date: string, score: number) => void;
  onLogJourney: (action: string, details: string) => void;
}

const BODY_OPTIONS = [
  'Jaw tension',
  'Shoulder tension',
  'Shallow breathing',
  'Headache',
  'Fatigue',
  'Restlessness',
  'Stomach discomfort',
  'Calm / Settled'
];

export const SomaticCheckInCard: React.FC<SomaticCheckInCardProps> = ({
  onAwardPoints,
  onUpdateOperationalMetrics,
  onUpdatePulseHistory,
  onLogJourney,
}) => {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState<{ timestamp: string } | null>(null);

  const toggleOption = (opt: string) => {
    setSelectedOptions((prev) => 
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const executeCheckIn = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    await new Promise((resolve) => setTimeout(resolve, 600));

    // Calculate generic impact based on selections (purely arbitrary for UX)
    const issueCount = selectedOptions.filter(o => o !== 'Calm / Settled').length;
    const isCalm = selectedOptions.includes('Calm / Settled');
    
    let calculatedEnergy = 50;
    if (isCalm && issueCount === 0) calculatedEnergy = 90;
    else if (issueCount > 3) calculatedEnergy = 20;

    const calculatedRisk = calculatedEnergy < 40 ? 'High' : calculatedEnergy < 75 ? 'Moderate' : 'Low';

    onLogJourney(
      'Self-Reported Body Check-In Recorded',
      `Options: ${selectedOptions.join(', ')}. Risk state formulated: ${calculatedRisk}. Note: ${note || 'None'}`
    );

    onUpdateOperationalMetrics(calculatedEnergy, calculatedRisk);

    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    onUpdatePulseHistory(todayStr, calculatedEnergy);

    setLastCheckIn({
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    setSelectedOptions([]);
    setNote('');
    setIsSubmitting(false);
  };

  return (
    <SmartCardWrapper id="somaticCheckIn" title="Body Check-In">
      <div className="relative p-6 space-y-6 overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
             <h3 className="text-sm font-bold text-text-main flex items-center gap-2 tracking-tight">
              <HeartPulse className="w-4 h-4 text-primary" />
              Body Check-In
            </h3>
            <p className="text-xs text-text-muted">How does your body feel right now?</p>
            <p className="text-[10px] text-text-muted italic">This is a self-reported body check-in, not a medical measurement.</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!isSubmitting ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              {lastCheckIn && (
                 <div className="bg-surface border border-white/[0.03] p-3 rounded-xl flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-[#6366f1]">
                    <span>Last Recorded ({lastCheckIn.timestamp})</span>
                    <span className="text-text-muted">Saved locally</span>
                 </div>
              )}

              <div className="flex flex-wrap gap-2">
                {BODY_OPTIONS.map((opt) => {
                  const isSelected = selectedOptions.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => toggleOption(opt)}
                      className={cn(
                        "text-[11px] px-3 py-1.5 rounded-full border transition-colors cursor-pointer",
                         isSelected 
                          ? "bg-primary/20 border-primary/40 text-primary font-medium" 
                          : "bg-surface border-white/[0.05] text-text-muted hover:text-text-main"
                      )}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional private note..."
                className="w-full bg-surface border border-white/[0.05] rounded-xl p-3 text-xs text-text-main resize-none focus:outline-none focus:border-primary/40"
                rows={2}
              />

              <button
                onClick={executeCheckIn}
                disabled={selectedOptions.length === 0 && note.trim().length === 0}
                className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-xs rounded-xl shadow-lg border border-primary/25 disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save Check-In</span>
              </button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-8 space-y-4 text-center"
            >
              <div className="relative inline-flex items-center justify-center p-1 font-bold">
                 <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
              <p className="text-xs font-bold text-text-main">Saving internally...</p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </SmartCardWrapper>
  );
};

const SmartCardWrapper = ({ id, title, children }: { id: string, title: string, children: React.ReactNode }) => {
  return (
    <div
      id={id}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('cardId', id); }}
      onDragOver={(e) => { e.preventDefault(); }}
      className={cn(
        "card group select-none cursor-grab active:cursor-grabbing border border-white/[0.05] dark:bg-card/45 bg-background/40 relative transition-all duration-500 hover:shadow-[0_0_30px_rgba(234,88,12,0.06)] overflow-hidden rounded-xl"
      )}
    >
      <div className="absolute top-1.5 right-3 text-[9px] text-text-muted/20 font-black uppercase tracking-widest pointer-events-none font-mono">
        DRAGGABLE bento
      </div>
      {children}
    </div>
  );
};

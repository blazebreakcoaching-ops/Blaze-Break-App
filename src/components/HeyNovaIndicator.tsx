import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '../lib/utils';
import type { HeyNovaWakeStatus } from '../lib/useHeyNovaWakeWord';

interface HeyNovaIndicatorProps {
  status: HeyNovaWakeStatus;
  // Bumped by the wake-word hook every time "hey Nova" is detected - drives
  // a brief "heard you" pulse here, alongside the acknowledgement tone the
  // hook plays at the same moment, right before the command palette opens.
  lastWakeAt: number | null;
}

// Small, unobtrusive corner badge so someone always knows the mic is
// live while the "Hey Nova" wake word is on - never shown at all once the
// feature is off or unsupported, since there's nothing to disclose then.
export const HeyNovaIndicator = ({ status, lastWakeAt }: HeyNovaIndicatorProps) => {
  const [justWoke, setJustWoke] = useState(false);

  useEffect(() => {
    if (lastWakeAt === null) return;
    setJustWoke(true);
    const t = setTimeout(() => setJustWoke(false), 700);
    return () => clearTimeout(t);
  }, [lastWakeAt]);

  if (status === 'idle' || status === 'unsupported') return null;

  const listening = status === 'listening';

  return (
    <motion.div
      animate={justWoke ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn(
        'fixed bottom-4 left-4 z-[60] flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest shadow-lg backdrop-blur-sm transition-colors',
        justWoke
          ? 'border-primary bg-primary/20 text-primary shadow-primary/30'
          : listening
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-card text-text-muted'
      )}
      role="status"
      aria-live="polite"
    >
      {listening ? (
        <Mic className="w-3 h-3 animate-pulse" aria-hidden="true" />
      ) : (
        <MicOff className="w-3 h-3" aria-hidden="true" />
      )}
      <span>
        {justWoke ? 'Heard you!' : listening ? 'Listening for "Hey Nova"' : 'Mic access needed for "Hey Nova"'}
      </span>
    </motion.div>
  );
};

export default HeyNovaIndicator;

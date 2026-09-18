import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '../lib/utils';
import type { HeyNovaWakeStatus } from '../lib/useHeyNovaWakeWord';

interface HeyNovaIndicatorProps {
  status: HeyNovaWakeStatus;
}

// Small, unobtrusive corner badge so someone always knows the mic is
// live while the "Hey Nova" wake word is on - never shown at all once the
// feature is off or unsupported, since there's nothing to disclose then.
export const HeyNovaIndicator = ({ status }: HeyNovaIndicatorProps) => {
  if (status === 'idle' || status === 'unsupported') return null;

  const listening = status === 'listening';

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 z-[60] flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest shadow-lg backdrop-blur-sm transition-colors',
        listening
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
        {listening ? 'Listening for "Hey Nova"' : 'Mic access needed for "Hey Nova"'}
      </span>
    </div>
  );
};

export default HeyNovaIndicator;

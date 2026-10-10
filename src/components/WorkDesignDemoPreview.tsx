import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { WorkDesignSignalCard } from './WorkDesignSignalCard';
import { DEMO_WORK_DESIGN_SIGNALS } from '../../work-design-signals';

// Before this existed, a locked ("not enough consenting members yet")
// Work Design view showed nothing but a bare lock screen - an org still
// ramping up opt-ins had no way to see what the view would actually show
// them once it unlocks. DataSufficiencyStatus already declared a 'demo'
// status for exactly this reason, but nothing ever produced it. This
// renders the one canonical demo fixture through the real
// WorkDesignSignalCard, clearly labelled, never a bespoke demo-only card.
export const WorkDesignDemoPreview = () => {
  const [showDemo, setShowDemo] = useState(false);

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowDemo((v) => !v)}
        className="text-xs font-bold text-primary hover:opacity-70 flex items-center gap-1.5 mx-auto"
      >
        {showDemo ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        {showDemo ? 'Hide sample preview' : 'Preview with sample data'}
      </button>
      {showDemo && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
          <p className="text-xs text-text-muted text-center">
            Sample data - not your organisation's real signal. Shown so you can see what this view will look like once enough members opt in.
          </p>
          <ul className="space-y-2.5 text-left">
            {DEMO_WORK_DESIGN_SIGNALS.map((signal) => (
              <WorkDesignSignalCard key={signal.key} signal={signal} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

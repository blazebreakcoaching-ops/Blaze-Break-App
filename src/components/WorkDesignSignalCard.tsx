import { cn } from '../lib/utils';

// Shared shape every WDI view (manager/HR/executive) receives from
// server.ts's buildMeetingPressureSignal - and the exact shape the demo
// fixture (work-design-signals.ts's DEMO_WORK_DESIGN_SIGNALS) is
// pre-shaped into, so a "preview with sample data" toggle renders
// through this one real card component rather than a bespoke demo-only
// layout that could silently drift from what real signals look like.
export interface WorkDesignSignal {
  key: string;
  label: string;
  band: 'low' | 'typical' | 'elevated' | 'sustained' | null;
  bandLabel: string | null;
  sufficiencyStatus: 'available' | 'insufficient_data' | 'not_connected' | 'stale' | 'demo';
  sufficiencyMessage: string;
  basis: string;
  confidence?: 'strong' | 'moderate' | 'limited' | 'insufficient' | null;
  confidenceExplanation?: string | null;
}

const BAND_BADGE_CLASSES: Record<string, string> = {
  sustained: 'bg-destructive/10 text-destructive dark:text-[#f87171] border-destructive/20',
  elevated: 'bg-warning/10 text-[#9a3412] dark:text-warning border-warning/20',
  typical: 'bg-primary/10 text-primary border-primary/20',
  low: 'bg-success/10 text-[#166534] dark:text-[#4ade80] border-success/20',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  strong: 'Strong confidence',
  moderate: 'Moderate confidence',
  limited: 'Limited confidence',
  insufficient: 'Insufficient confidence',
};

export const WorkDesignSignalCard = ({ signal }: { signal: WorkDesignSignal }) => (
  <li className={cn(
    'flex items-center gap-4 p-4 rounded-xl border bg-surface/60 dark:bg-card/40',
    signal.sufficiencyStatus === 'demo' ? 'border-dashed border-primary/30' : 'border-border',
  )}>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-text-main truncate flex items-center gap-2">
        {signal.label}
        {signal.sufficiencyStatus === 'demo' && (
          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            Demo
          </span>
        )}
      </p>
      <p className="text-xs text-text-muted mt-0.5">
        {signal.band ? signal.basis : signal.sufficiencyMessage}
      </p>
      {signal.confidence && (
        <p className="text-[11px] text-text-muted mt-1" title={signal.confidenceExplanation || undefined}>
          {CONFIDENCE_LABELS[signal.confidence]}
        </p>
      )}
    </div>
    {signal.band ? (
      <span className={cn('shrink-0 text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border', BAND_BADGE_CLASSES[signal.band])}>
        {signal.bandLabel}
      </span>
    ) : (
      <span className="shrink-0 text-[11px] text-text-muted">not enough data yet</span>
    )}
  </li>
);

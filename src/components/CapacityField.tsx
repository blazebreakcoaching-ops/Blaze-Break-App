import { CapacityFieldModel } from '../../capacity-field-engine';
import { cn } from '../lib/utils';

interface CapacityFieldProps {
  field: CapacityFieldModel;
}

const TIGHTNESS_BAR_CLASSES: Record<CapacityFieldModel['tightness'], string> = {
  comfortable: 'bg-success',
  tight: 'bg-warning',
  very_tight: 'bg-[#f0b429]',
  over_capacity: 'bg-destructive',
  unknown: 'bg-border',
};

const TIGHTNESS_TEXT_CLASSES: Record<CapacityFieldModel['tightness'], string> = {
  comfortable: 'text-success dark:text-[#4ade80]',
  tight: 'text-[#9a3412] dark:text-warning',
  very_tight: 'text-[#9a3412] dark:text-warning',
  over_capacity: 'text-destructive dark:text-[#f87171]',
  unknown: 'text-text-muted',
};

// A plain visualization of real numbers Energy Delta already computed -
// capacity score vs. planned load, as a filled field - never a prediction,
// never a fabricated value when the day hasn't been checked.
export const CapacityField = ({ field }: CapacityFieldProps) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-text-muted">
      <span>Today's capacity field</span>
      <span className={cn(TIGHTNESS_TEXT_CLASSES[field.tightness])}>{field.statusLine}</span>
    </div>
    <div className="h-4 rounded-full bg-surface border border-border/50 overflow-hidden relative">
      {field.available && (
        <div
          className={cn('h-full rounded-full transition-all duration-500', TIGHTNESS_BAR_CLASSES[field.tightness])}
          style={{ width: `${field.loadFillPercent}%` }}
          role="img"
          aria-label={`Planned load ${field.plannedLoad} out of capacity ${field.capacityScore}`}
        />
      )}
    </div>
    {field.available && (
      <div className="flex items-center justify-between text-[11px] font-medium text-text-muted">
        <span>Planned load: {field.plannedLoad}</span>
        <span>Capacity: {field.capacityScore}</span>
      </div>
    )}
  </div>
);

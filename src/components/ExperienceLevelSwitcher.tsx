import { EXPERIENCE_LEVELS, EXPERIENCE_LEVEL_GUIDANCE, EXPERIENCE_LEVEL_LABELS, type ExperienceLevel } from '../../experience-level';
import { cn } from '../lib/utils';

// Customer-chosen display level. Progressive disclosure only: it never
// locks a tool - "Explore all tools", Quick find, crisis support and
// settings stay available at every level.
export function ExperienceLevelSwitcher({
  level,
  onChange,
  error,
  className,
}: {
  level: ExperienceLevel;
  onChange: (level: ExperienceLevel) => void;
  error?: string | null;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)} data-testid="experience-level-switcher">
      <p id="experience-level-label" className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
        Your experience
      </p>
      <div role="radiogroup" aria-labelledby="experience-level-label" className="grid grid-cols-3 gap-1 rounded-xl bg-surface border border-border p-1">
        {EXPERIENCE_LEVELS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={level === option}
            onClick={() => { if (option !== level) onChange(option); }}
            className={cn(
              'min-w-0 rounded-lg px-0.5 py-1.5 text-[11px] font-semibold tracking-tight transition-colors',
              level === option ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text-main',
            )}
          >
            {EXPERIENCE_LEVEL_LABELS[option]}
          </button>
        ))}
      </div>
      <p className="text-xs leading-snug text-text-muted" aria-live="polite">
        <span className="font-semibold text-ember-accent">Nova Blaze:</span> {EXPERIENCE_LEVEL_GUIDANCE[level]}
      </p>
      {error && <p role="alert" className="text-xs text-ember-danger">{error}</p>}
    </div>
  );
}

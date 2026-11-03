import { useEffect, useRef, useState } from 'react';
import { MonitorSmartphone, Moon, Sun, Check, ChevronDown } from 'lucide-react';
import type { AppearanceMode } from '../lib/appearance-theme';

const OPTIONS: { mode: AppearanceMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: MonitorSmartphone },
];

export function AppearanceMenu({ mode, onChange, compact = false, above = false }: {
  mode: AppearanceMode;
  onChange: (mode: AppearanceMode) => void;
  compact?: boolean;
  above?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = OPTIONS.find(option => option.mode === mode) ?? OPTIONS[2]!;
  const SelectedIcon = selected.Icon;
  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={`Appearance: ${selected.label}. Choose Light, Dark or System.`}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2 rounded-xl border border-border bg-surface dark:bg-card p-3 text-text-main hover:border-primary/50 transition-colors w-full"
      >
        <SelectedIcon aria-hidden="true" className="w-5 h-5 text-primary shrink-0" />
        {!compact && <span className="text-xs font-bold uppercase tracking-wider flex-1 text-left">Appearance · {selected.label}</span>}
        {!compact && <ChevronDown aria-hidden="true" className="w-4 h-4 text-text-muted" />}
      </button>
      {open && (
        <div role="group" aria-label="Appearance options"
          className={`absolute z-[190] min-w-44 rounded-xl bg-card text-text-main shadow-xl border border-border p-1 ${above ? 'bottom-full mb-2' : 'top-full mt-2'} right-0`}
        >
          {OPTIONS.map(({ mode: value, label, Icon }) => (
            <button key={value} type="button" aria-pressed={mode === value}
              onClick={() => { onChange(value); setOpen(false); }}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon aria-hidden="true" className="w-4 h-4 text-primary" />
              <span className="flex-1 text-left">{label}</span>
              {mode === value && <Check aria-hidden="true" className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

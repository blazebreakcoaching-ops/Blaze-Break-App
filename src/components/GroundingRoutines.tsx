import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Sunrise, Moon, ShieldAlert, RotateCcw, Plus, Trash2, Play } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { collection, doc, getDocs, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { GroundingLens, GROUNDING_LENS_ORDER, GROUNDING_LENSES } from '../../grounding-content';
import { SessionDepth, SESSION_DEPTH_LABELS, ClosingStyle, CLOSING_STYLES } from '../../grounding-adaptive';
import { PRESET_ROUTINES, PRESET_ROUTINE_ORDER, PresetRoutineType } from '../../grounding-routines';
import { logGroundingEvent } from '../lib/grounding-analytics';
import { GroundingRoutineRun } from './GroundingRoutineRun';

interface RoutineDoc {
  id: string;
  name: string;
  type: string;
  sessionDepth?: SessionDepth;
  lens?: GroundingLens;
  closingStyle?: ClosingStyle;
  reminderEnabled?: boolean;
  lastCompletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const PRESET_ICONS: Record<PresetRoutineType, any> = { morning: Sunrise, evening: Moon, before_difficult: ShieldAlert, after_difficult: RotateCcw };

// Reminders are a gentle in-app "due" badge, checked on load against
// lastCompletedAt - not a push notification (see the firestore.rules
// comment on groundingRoutines for why: the existing notification
// infrastructure is category/frequency-based, not time-of-day precise).
// Deliberately date-only, not time-of-day - "due today" rather than
// "due at 7:30am", so this never needs a clock check more precise than
// what the person already gets just by opening the app.
const isDueToday = (r: RoutineDoc): boolean => {
  if (!r.reminderEnabled) return false;
  if (!r.lastCompletedAt) return true;
  return new Date(r.lastCompletedAt).toDateString() !== new Date().toDateString();
};

interface GroundingRoutinesProps {
  onClose: () => void;
  onStartCustomSession: (depth: SessionDepth, lens: GroundingLens) => void;
}

export const GroundingRoutines = ({ onClose, onStartCustomSession }: GroundingRoutinesProps) => {
  const [routines, setRoutines] = useState<RoutineDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState<{ routineId: string | null; name: string; prompts: string[]; finishPrompt?: string; closingStyle: ClosingStyle; lens: GroundingLens } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDepth, setNewDepth] = useState<SessionDepth>('ground');
  const [newLens, setNewLens] = useState<GroundingLens>('secular');
  const [newClosingStyle, setNewClosingStyle] = useState<ClosingStyle>('compassionate');

  const load = async () => {
    if (!auth.currentUser) { setLoaded(true); return; }
    try {
      const snap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'groundingRoutines'));
      setRoutines(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e) {
      // Leaves the list empty rather than guessing at history.
    }
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const presetDoc = (type: PresetRoutineType) => routines.find((r) => r.id === type);
  const customRoutines = routines.filter((r) => r.type === 'custom');

  const startPreset = (type: PresetRoutineType) => {
    const preset = PRESET_ROUTINES[type];
    const existing = presetDoc(type);
    setRunning({ routineId: type, name: preset.name, prompts: preset.prompts, finishPrompt: preset.finishPrompt, closingStyle: preset.closingStyle, lens: existing?.lens || 'secular' });
  };

  const savePresetField = async (type: PresetRoutineType, field: 'reminderEnabled' | 'lens', value: boolean | GroundingLens) => {
    if (!auth.currentUser) return;
    const now = new Date().toISOString();
    const existing = presetDoc(type);
    await setDoc(doc(db, 'users', auth.currentUser.uid, 'groundingRoutines', type), {
      name: PRESET_ROUTINES[type].name, type, [field]: value,
      ...(existing ? {} : { createdAt: now }),
      updatedAt: now,
    }, { merge: true });
    load();
  };

  const createCustomRoutine = async () => {
    if (!auth.currentUser || !newName.trim()) return;
    const now = new Date().toISOString();
    await addDoc(collection(db, 'users', auth.currentUser.uid, 'groundingRoutines'), {
      name: newName.trim().slice(0, 60), type: 'custom', sessionDepth: newDepth, lens: newLens,
      closingStyle: newClosingStyle, createdAt: now, updatedAt: now,
    });
    logGroundingEvent('routine_created');
    setNewName('');
    setCreating(false);
    load();
  };

  const deleteRoutine = async (id: string) => {
    if (!auth.currentUser) return;
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    deleteDoc(doc(db, 'users', auth.currentUser.uid, 'groundingRoutines', id)).catch(() => {});
  };

  if (running) {
    return <GroundingRoutineRun {...running} onClose={() => { setRunning(null); load(); }} />;
  }

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl bg-card border border-border/40 rounded-2xl p-8 space-y-8 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-display font-bold text-text-main">Your Grounding Routines</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-main"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          {PRESET_ROUTINE_ORDER.map((type) => {
            const preset = PRESET_ROUTINES[type];
            const existing = presetDoc(type);
            const Icon = PRESET_ICONS[type];
            const due = existing ? isDueToday(existing) : false;
            return (
              <div key={type} className="p-4 rounded-xl border border-border/40 bg-white/40 dark:bg-card/40 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-text-main flex items-center gap-2">
                        {preset.name}
                        {due && <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-primary/10 text-[#9a3412] dark:text-primary">Due today</span>}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">{preset.prompts.length} short questions</p>
                    </div>
                  </div>
                  <button onClick={() => startPreset(type)} className="px-4 py-2 bg-primary/10 text-[#9a3412] dark:text-primary rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                    <Play className="w-3 h-3" /> Start
                  </button>
                </div>
                <div className="flex items-center justify-between pl-7">
                  <span className="text-[11px] text-text-muted">Lens</span>
                  <select
                    value={existing?.lens || 'secular'}
                    onChange={(e) => savePresetField(type, 'lens', e.target.value as GroundingLens)}
                    className="p-1.5 rounded-lg border border-border/40 bg-white dark:bg-surface text-[11px] text-text-main"
                  >
                    {GROUNDING_LENS_ORDER.map((l) => <option key={l} value={l}>{GROUNDING_LENSES[l].label}</option>)}
                  </select>
                </div>
                {preset.supportsDailyReminder && (
                  <div className="flex items-center justify-between pl-7">
                    <span className="text-[11px] text-text-muted">Daily reminder</span>
                    <button
                      onClick={() => savePresetField(type, 'reminderEnabled', !existing?.reminderEnabled)}
                      role="switch"
                      aria-checked={!!existing?.reminderEnabled}
                      className={cn('px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all',
                        existing?.reminderEnabled ? 'bg-text-main text-background border-text-main' : 'bg-transparent text-text-muted border-border/40')}
                    >
                      {existing?.reminderEnabled ? 'On' : 'Off'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 pt-2 border-t border-border/20">
          <h4 className="text-xs uppercase font-black tracking-widest text-text-muted pt-4">Your custom routines</h4>
          {customRoutines.map((r) => (
            <div key={r.id} className="p-4 rounded-xl border border-border/20 bg-white/40 dark:bg-card/40 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-text-main">{r.name}</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {SESSION_DEPTH_LABELS[r.sessionDepth || 'ground'].label} · {GROUNDING_LENSES[r.lens || 'secular'].label}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { onStartCustomSession(r.sessionDepth || 'ground', r.lens || 'secular'); onClose(); }}
                  className="px-4 py-2 bg-primary/10 text-[#9a3412] dark:text-primary rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5"
                >
                  <Play className="w-3 h-3" /> Start
                </button>
                <button onClick={() => deleteRoutine(r.id)} aria-label="Delete routine" className="text-text-muted hover:text-destructive p-2">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {loaded && customRoutines.length === 0 && !creating && (
            <p className="text-xs text-text-muted">No custom routines yet.</p>
          )}

          {!creating ? (
            <button onClick={() => setCreating(true)} className="px-4 py-2.5 border border-border/40 rounded-xl text-[11px] font-black uppercase tracking-widest text-text-muted hover:text-text-main flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create a custom routine
            </button>
          ) : (
            <div className="p-4 rounded-xl border border-border/40 bg-surface/20 space-y-4">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value.slice(0, 60))}
                placeholder="e.g. Sunday Reset, Before Family Conversations..."
                autoFocus
                className="w-full p-3 rounded-lg border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-black tracking-wider text-text-muted">Depth</label>
                  <div className="flex gap-1.5 mt-1.5">
                    {(['reset', 'ground', 'deep'] as SessionDepth[]).map((d) => (
                      <button key={d} onClick={() => setNewDepth(d)} aria-pressed={newDepth === d}
                        className={cn('flex-1 py-2 rounded-lg text-[10px] font-bold border', newDepth === d ? 'bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>
                        {SESSION_DEPTH_LABELS[d].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black tracking-wider text-text-muted">Lens</label>
                  <select value={newLens} onChange={(e) => setNewLens(e.target.value as GroundingLens)}
                    className="w-full mt-1.5 p-2 rounded-lg border border-border/40 bg-white dark:bg-surface text-xs text-text-main">
                    {GROUNDING_LENS_ORDER.map((l) => <option key={l} value={l}>{GROUNDING_LENSES[l].label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-black tracking-wider text-text-muted">Closing style</label>
                <select value={newClosingStyle} onChange={(e) => setNewClosingStyle(e.target.value as ClosingStyle)}
                  className="w-full mt-1.5 p-2 rounded-lg border border-border/40 bg-white dark:bg-surface text-xs text-text-main">
                  {(Object.keys(CLOSING_STYLES) as ClosingStyle[]).map((c) => <option key={c} value={c}>{CLOSING_STYLES[c]}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => { setCreating(false); setNewName(''); }} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">Cancel</button>
                <button disabled={!newName.trim()} onClick={createCustomRoutine} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40">Save</button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

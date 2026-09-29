import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle2, Sparkles, Feather } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { GroundingSessionRecord, BURDEN_LABELS, ISLAMIC_THEMES } from '../../grounding-content';
import { DerivedPattern, PATTERN_DIMENSIONS, compareThemeShift, VALUES_LIST } from '../../grounding-patterns-taxonomy';
import { logGroundingEvent } from '../lib/grounding-analytics';

interface GroundingMonthlyReflectionProps {
  sessions: GroundingSessionRecord[];
  derivedPatterns: DerivedPattern[];
  onClose: () => void;
}

// One doc per calendar month (firestore.rules AK) - a person reflecting
// twice in the same month updates the same doc rather than creating a
// second one for a period that's already been looked back on.
const monthIdFor = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const GroundingMonthlyReflection = ({ sessions, derivedPatterns, onClose }: GroundingMonthlyReflectionProps) => {
  const [carryForwardValue, setCarryForwardValue] = useState<string | null>(null);
  // Deliberately never persisted (no field for either in firestore.rules'
  // monthly_reflections schema) - both are for the person to sit with in
  // the moment, not a record Nova reads back later.
  const [stillNeedsAttention, setStillNeedsAttention] = useState('');
  const [leftHere, setLeftHere] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { logGroundingEvent('monthly_reflection_viewed'); }, []);

  // Looking back: the single most-frequently-named burden, and every
  // pattern that's earned at least "recurring" confidence - never
  // "emerging" ones, which haven't shown enough to be worth calling back.
  const heaviestTheme = useMemo(() => {
    const counts = new Map<string, number>();
    sessions.forEach((s) => {
      [...s.burdenIds.map((id) => BURDEN_LABELS[id]), s.customBurden].filter(Boolean).forEach((label) => {
        counts.set(label as string, (counts.get(label as string) || 0) + 1);
      });
    });
    let best: string | null = null;
    let bestCount = 0;
    counts.forEach((count, label) => { if (count > bestCount) { best = label; bestCount = count; } });
    return best;
  }, [sessions]);

  const recurringThemes = useMemo(
    () => derivedPatterns
      .filter((p) => p.status === 'recurring' || p.status === 'established')
      .slice(0, 10)
      .map((p) => PATTERN_DIMENSIONS[p.patternKey].label),
    [derivedPatterns]
  );

  // What changed: the one theme whose frequency shifted most between the
  // earlier and later half of the sessions in view - deterministic, no AI
  // call, see compareThemeShift's own reasoning.
  const whatChanged = useMemo(() => {
    const chronological = [...sessions].reverse();
    const mid = Math.floor(chronological.length / 2);
    const shift = compareThemeShift(chronological.slice(0, mid), chronological.slice(mid));
    if (!shift) return "Nothing shifted dramatically this stretch - steady is its own kind of progress.";
    const label = PATTERN_DIMENSIONS[shift.patternKey].label;
    return shift.direction === 'increasing'
      ? `${label} has come up more often recently than earlier in this stretch.`
      : `${label} has come up less often recently than earlier in this stretch.`;
  }, [sessions]);

  const whatHelpedList = useMemo(() => {
    const approaches = new Set<string>();
    sessions.forEach((s) => {
      if (s.islamicThemeId) approaches.add(ISLAMIC_THEMES[s.islamicThemeId].label);
      if (s.nextAction === 'trusted_person') approaches.add('Talking to someone');
      if (s.nextAction === 'next_step' || s.nextAction === 'practical_action') approaches.add('Taking one practical step');
      if (s.nextAction === 'continue_with_nova' || s.nextAction === 'nova') approaches.add('Talking it through with Nova');
      if (s.nextAction === 'sit_with_this' || s.nextAction === 'rest') approaches.add('Simply sitting with it');
    });
    return [...approaches].slice(0, 6);
  }, [sessions]);

  const handleSave = async () => {
    if (!auth.currentUser) { setSaved(true); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const ref = doc(db, 'users', auth.currentUser.uid, 'monthly_reflections', monthIdFor());
      const existing = await getDoc(ref);
      const now = new Date().toISOString();
      const record: Record<string, unknown> = {
        createdAt: existing.exists() && existing.data()?.createdAt ? existing.data()!.createdAt : now,
        updatedAt: now,
      };
      if (heaviestTheme) record.heaviestTheme = heaviestTheme.slice(0, 300);
      if (recurringThemes.length > 0) record.recurringThemes = recurringThemes;
      if (whatChanged) record.whatChanged = whatChanged.slice(0, 400);
      if (whatHelpedList.length > 0) record.whatHelped = whatHelpedList.join(', ').slice(0, 400);
      if (carryForwardValue) record.carryForwardValue = carryForwardValue.slice(0, 40);
      await setDoc(ref, record, { merge: true });
      setSaved(true);
    } catch (e) {
      setSaveError('Could not save this reflection right now. You can still sit with what you noticed.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-card border border-border/40 rounded-2xl p-8 space-y-8 my-8"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-display font-bold text-text-main">Reflect on this month</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-main">
            <X className="w-4 h-4" />
          </button>
        </div>

        {saved ? (
          <div className="py-10 text-center space-y-4">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
            <p className="text-base text-text-main font-medium max-w-sm mx-auto">
              You don't need to solve the next month tonight. Choose what matters next.
            </p>
            <button onClick={onClose} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest">
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <section className="space-y-3">
              <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">Looking back</h4>
              {heaviestTheme && (
                <p className="text-sm text-text-main">
                  What weighed heaviest: <span className="font-bold">{heaviestTheme}</span>
                </p>
              )}
              {recurringThemes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recurringThemes.map((t) => (
                    <span key={t} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-[#9a3412] dark:text-primary">{t}</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted">No single theme has repeated enough yet to call recurring - that's not a problem to fix.</p>
              )}
            </section>

            <section className="space-y-2">
              <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">What changed</h4>
              <p className="text-sm text-text-main">{whatChanged}</p>
            </section>

            {whatHelpedList.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">What helped</h4>
                <div className="flex flex-wrap gap-2">
                  {whatHelpedList.map((a) => (
                    <span key={a} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-surface text-text-muted">{a}</span>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">What still needs attention</h4>
              <p className="text-xs text-text-muted">Just for you to see - this isn't saved anywhere.</p>
              <textarea
                value={stillNeedsAttention}
                onChange={(e) => setStillNeedsAttention(e.target.value.slice(0, 400))}
                rows={3}
                placeholder="What's still unresolved, in your own words..."
                className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
              />
            </section>

            <section className="space-y-3">
              <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">What you want to carry forward</h4>
              <div className="flex flex-wrap gap-2">
                {VALUES_LIST.map((v) => (
                  <button
                    key={v}
                    onClick={() => setCarryForwardValue(carryForwardValue === v ? null : v)}
                    aria-pressed={carryForwardValue === v}
                    className={cn(
                      'px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer',
                      carryForwardValue === v ? 'bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border'
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3 bg-surface/20 p-5 rounded-2xl border border-border/20">
              <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">What you can leave here</h4>
              <p className="text-xs text-text-muted">Nothing from this month has to follow you into the next.</p>
              <button
                onClick={() => setLeftHere(true)}
                disabled={leftHere}
                className={cn(
                  'px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all',
                  leftHere ? 'bg-primary/10 text-[#9a3412] dark:text-primary' : 'border border-border/40 text-text-muted hover:text-text-main'
                )}
              >
                <Feather className="w-3.5 h-3.5" /> {leftHere ? 'Left here' : "I'll leave this here"}
              </button>
            </section>

            {saveError && <p className="text-xs text-destructive">{saveError}</p>}

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" /> {saving ? 'Saving...' : 'Save this reflection'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { History, Moon, Brain, Users, Sparkles, Loader2, Edit3 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { loadLatestCapacityCheckIn, loadStressors } from '../lib/energy-delta-service';
import { loadSleepTargetHours, setSleepTargetHours, logSleepHours, loadRecentSleepNights } from '../lib/recovery-debt-service';
import {
  computeSleepShortfall, computeMentalFatigue, computeSocialLoad,
  MENTAL_FATIGUE_LABELS, SOCIAL_LOAD_LABELS, MentalFatigueLevel, SocialLoadBand, SleepNight,
} from '../../recovery-debt-engine';
import { CapacityLevel, Stressor } from '../../energy-delta-engine';
import { DEMO_CAPACITY_CHECKIN, DEMO_ENERGY_STRESSORS, DEMO_SLEEP_TARGET_HOURS, DEMO_SLEEP_NIGHTS } from '../lib/demo-data';

// Recovery Debt Inventory v2 - "what hasn't had enough time to recover?"
// Every number here traces back to recovery-debt-engine.ts, reusing the
// same capacity check-ins and stressors Energy & Capacity already
// collects rather than a second, parallel data source. Nothing here is a
// measurement of a physiological or neurological state - Sleep Shortfall
// is self-reported hours, Mental Fatigue is a self-reported check-in
// level, Social Load is self-logged commitments.

const novaReadForSleep = (shortfall: number | null): string => {
  if (shortfall === null) return "Log a night or two and I'll have a read on this.";
  if (shortfall <= 1) return "Your sleep's been solid lately - keep the rhythm going.";
  if (shortfall <= 3) return "You're running a bit short on sleep. Tonight's a good night to protect your wind-down.";
  return "Your sleep shortfall has been building for a few days. This is worth prioritising tonight.";
};

const counterMoveForSleep = (shortfall: number | null): string =>
  shortfall !== null && shortfall > 1
    ? "Protect tonight's wind-down - screens off, lights down, same time as usual."
    : "Nothing to change here - keep doing what's working.";

const novaReadForMentalFatigue = (level: MentalFatigueLevel | null): string => {
  if (level === null) return "Check in on your capacity above and I'll have a read on this.";
  if (level === 'low') return "Your mental load looks manageable right now.";
  if (level === 'moderate') return "Your mental load is building. Protect one more focus block, then stop.";
  return "Your mental load looks high. Don't make the next hour harder than it needs to be.";
};

const counterMoveForMentalFatigue = (level: MentalFatigueLevel | null): string => {
  if (level === 'high') return "Step away for a low-stimulation break before tackling anything complex.";
  if (level === 'moderate') return "Take a real break before your next deep-work block.";
  return "Nothing to change here - keep doing what's working.";
};

const novaReadForSocialLoad = (band: SocialLoadBand | null, acceptedWhileLow: boolean): string => {
  if (band === null) return "Log a social commitment in your Energy Audit and I'll have a read on this.";
  if (band === 'low') return "Your social load is light right now.";
  if (band === 'moderate') return "You've got a few social commitments stacking up.";
  return acceptedWhileLow
    ? "Your social load is heavy right now, and some of it was taken on while your capacity was already low."
    : "Your social load is heavy right now.";
};

const counterMoveForSocialLoad = (band: SocialLoadBand | null): string =>
  band === 'high' || band === 'moderate'
    ? "Draft a polite no for one commitment you do not have capacity for."
    : "Nothing to change here - keep doing what's working.";

export const DebtTracker = ({ isDemoSession }: { isDemoSession?: boolean }) => {
  const [loading, setLoading] = useState(true);
  const [mentalLevel, setMentalLevel] = useState<CapacityLevel | null>(null);
  const [socialStressors, setSocialStressors] = useState<Pick<Stressor, 'severity' | 'persistence' | 'capacityAtLogging'>[]>([]);
  const [targetHours, setTargetHoursState] = useState(8);
  const [recentNights, setRecentNights] = useState<SleepNight[]>([]);

  const [sleepInput, setSleepInput] = useState('');
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('8');

  const uid = auth.currentUser?.uid;

  const load = async () => {
    if (isDemoSession) {
      setMentalLevel(DEMO_CAPACITY_CHECKIN.mental);
      setSocialStressors(DEMO_ENERGY_STRESSORS.filter((s) => s.status === 'active' && s.category === 'social'));
      setTargetHoursState(DEMO_SLEEP_TARGET_HOURS);
      setRecentNights(DEMO_SLEEP_NIGHTS);
      setLoading(false);
      return;
    }
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    const [checkIn, stressors, target, nights] = await Promise.all([
      loadLatestCapacityCheckIn(uid), loadStressors(uid), loadSleepTargetHours(uid), loadRecentSleepNights(uid),
    ]);
    setMentalLevel(checkIn?.mental ?? null);
    setSocialStressors(stressors.filter((s) => s.status === 'active' && s.category === 'social'));
    setTargetHoursState(target);
    setRecentNights(nights);
    setLoading(false);
  };
  useEffect(() => { load(); }, [uid, isDemoSession]);

  const sleepShortfall = computeSleepShortfall(targetHours, recentNights);
  const mentalFatigue = computeMentalFatigue(mentalLevel);
  const socialLoad = computeSocialLoad(socialStressors);

  const submitSleepLog = async () => {
    const hours = parseFloat(sleepInput);
    if (isNaN(hours) || hours < 0 || hours > 24) return;
    if (isDemoSession || !uid) {
      setRecentNights((prev) => [...prev, { date: new Date().toISOString().split('T')[0]!, hours }]);
      setSleepInput('');
      return;
    }
    setSleepInput('');
    await logSleepHours(uid, hours);
    load();
  };

  const submitTarget = async () => {
    const hours = parseFloat(targetInput);
    if (isNaN(hours) || hours < 1 || hours > 14) return;
    setEditingTarget(false);
    if (isDemoSession || !uid) {
      setTargetHoursState(hours);
      return;
    }
    setTargetHoursState(hours);
    await setSleepTargetHours(uid, hours);
  };

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-16 bg-card border-border">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="card space-y-8 bg-card border-border shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="space-y-1">
          <h3 className="text-xl font-light text-text-main tracking-tight">Recovery Debt Inventory</h3>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">What hasn't had enough time to recover?</p>
        </div>
        <div className="p-2 bg-surface dark:bg-surface rounded-lg">
          <History className="w-5 h-5 text-primary" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Sleep Shortfall */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-primary flex items-center gap-1.5"><Moon className="w-3.5 h-3.5" /> Sleep Shortfall</span>
              {sleepShortfall !== null ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-light text-text-main tabular-nums tracking-tighter">{sleepShortfall}</span>
                  <span className="text-lg text-text-muted font-light">h</span>
                </div>
              ) : (
                <p className="text-sm font-bold text-text-muted pt-2">Not enough sleep data yet.</p>
              )}
            </div>
            <div className="text-right space-y-1 text-xs text-text-muted">
              <span className="block">Your 7-day shortfall</span>
              {editingTarget ? (
                <div className="flex items-center gap-1.5 justify-end">
                  <input
                    type="number" min={1} max={14} step={0.5}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    aria-label="Sleep target hours"
                    className="w-16 bg-surface border border-border rounded-lg px-2 py-1 text-xs text-text-main"
                  />
                  <button onClick={submitTarget} className="text-[10px] font-black uppercase text-primary">Save</button>
                </div>
              ) : (
                <button onClick={() => { setEditingTarget(true); setTargetInput(String(targetHours)); }} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-text-muted hover:text-primary ml-auto">
                  Target: {targetHours}h <Edit3 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">Short sleep can make concentration and emotional regulation harder.</p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="number" min={0} max={24} step={0.5}
              value={sleepInput}
              onChange={(e) => setSleepInput(e.target.value)}
              placeholder="Hours slept last night"
              aria-label="Log last night's sleep hours"
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-main placeholder:text-text-muted"
            />
            <button
              onClick={submitSleepLog}
              disabled={!sleepInput.trim()}
              className="px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
            >
              Log last night
            </button>
          </div>
          <NovaRead text={novaReadForSleep(sleepShortfall)} counterMove={counterMoveForSleep(sleepShortfall)} />
        </div>

        <DebtRow
          icon={<Brain className="w-3.5 h-3.5" />}
          label="Mental Fatigue"
          display={mentalFatigue ? MENTAL_FATIGUE_LABELS[mentalFatigue] : null}
          emptyText="Not checked in yet."
          supportingCopy="You may notice yourself rereading things, losing your train of thought or finding straightforward decisions harder."
          novaText={novaReadForMentalFatigue(mentalFatigue)}
          counterMove={counterMoveForMentalFatigue(mentalFatigue)}
        />

        <DebtRow
          icon={<Users className="w-3.5 h-3.5" />}
          label="Social Load"
          display={socialLoad.band ? SOCIAL_LOAD_LABELS[socialLoad.band] : null}
          emptyText="No social commitments logged yet."
          supportingCopy={
            socialLoad.commitmentCount > 0
              ? `${socialLoad.commitmentCount} active social commitment${socialLoad.commitmentCount === 1 ? '' : 's'} logged in your Energy Audit.${socialLoad.acceptedWhileLow ? ' At least one was taken on while your capacity was already low.' : ''}`
              : 'Overcommitting while capacity is already low can leave less room for your own priorities.'
          }
          novaText={novaReadForSocialLoad(socialLoad.band, socialLoad.acceptedWhileLow)}
          counterMove={counterMoveForSocialLoad(socialLoad.band)}
        />
      </div>
    </div>
  );
};

const DebtRow = ({
  icon, label, display, emptyText, supportingCopy, novaText, counterMove,
}: {
  icon: React.ReactNode; label: string; display: string | null; emptyText: string; supportingCopy: string; novaText: string; counterMove: string;
}) => (
  <div className="space-y-4 pt-2 border-t border-border/40">
    <div className="space-y-1">
      <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-primary flex items-center gap-1.5">{icon} {label}</span>
      {display !== null ? (
        <p className="text-2xl font-light text-text-main tracking-tight">{display}</p>
      ) : (
        <p className="text-sm font-bold text-text-muted pt-1">{emptyText}</p>
      )}
    </div>
    <p className="text-xs text-text-muted leading-relaxed">{supportingCopy}</p>
    <NovaRead text={novaText} counterMove={counterMove} />
  </div>
);

const NovaRead = ({ text, counterMove }: { text: string; counterMove: string }) => (
  <div className="p-5 bg-primary/5 rounded-xl border border-primary/10 relative overflow-hidden flex flex-col gap-3">
    <div className="relative z-10 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-[#9a3412] dark:text-primary" />
        <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-primary">Nova's Read</span>
      </div>
      <p className="text-sm text-text-main font-medium leading-relaxed">{text}</p>
    </div>
    <div className="pt-3 border-t border-primary/5 relative z-10">
      <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">Suggested Counter-Move</span>
      <p className="text-xs font-bold text-[#9a3412] dark:text-primary mt-1">{counterMove}</p>
    </div>
  </div>
);

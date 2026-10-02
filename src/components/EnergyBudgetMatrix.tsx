import { auth } from '../lib/firebase';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2, TrendingDown, Crosshair, Activity, BatteryWarning, BatteryCharging, Network, Loader2,
  RefreshCw, X,
} from 'lucide-react';
import { Area, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { DEMO_CAPACITY_CHECKIN, DEMO_ENERGY_STRESSORS, DEMO_DAILY_SNAPSHOTS } from '../lib/demo-data';
import {
  CapacityLevel, CAPACITY_LEVEL_ORDER, CAPACITY_LEVEL_LABELS,
  Stressor, StressorCategory, StressorSeverity, StressorPersistence, ReductionLevel, StressorAction,
  STRESSOR_SEVERITY_ORDER, STRESSOR_SEVERITY_LABELS, STRESSOR_PERSISTENCE_ORDER, STRESSOR_PERSISTENCE_LABELS,
  REDUCTION_LEVEL_ORDER, REDUCTION_LEVEL_LABELS, STRESSOR_CATEGORY_LABELS, STRESSOR_ACTION_LABELS,
  computeCapacityScore, describeCapacity,
  computeEnergyDelta, getDeltaState, computeSevenDayDelta, countStrainedDays, detectSustainedCapacityGap,
  MIN_VALID_DAYS_FOR_PATTERN, DailyEnergyRecord,
} from '../../energy-delta-engine';
import {
  loadLatestCapacityCheckIn, recordCapacityCheckIn, CapacityCheckInRecord,
  loadStressors, addStressor, reportStressorReduction, classifyStressor, resolveStressor, deleteStressor,
  recordDailySnapshot, loadRecentDailySnapshots, DailySnapshotRecord,
} from '../lib/energy-delta-service';

// Energy Delta Model v1 - "are the demands on me currently greater than
// the capacity I have available to meet them?" Capacity - Net Load =
// Energy Delta. The sophisticated math lives entirely in
// energy-delta-engine.ts; this component only ever calls into it and
// renders the result, never recomputing anything itself (section 18's
// "the sophisticated mathematics stays underneath").

const todayDateKey = (): string => new Date().toISOString().split('T')[0]!;

export const EnergyBudgetMatrix = ({ onPointsEarned, isDemoSession }: { onPointsEarned: (pts: number, reason: string) => void; isDemoSession?: boolean }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [latestCheckIn, setLatestCheckIn] = useState<CapacityCheckInRecord | null>(null);
  const [stressors, setStressors] = useState<Stressor[]>([]);
  const [snapshots, setSnapshots] = useState<DailySnapshotRecord[]>([]);

  const [showCheckIn, setShowCheckIn] = useState(false);
  const [physical, setPhysical] = useState<CapacityLevel | null>(null);
  const [mental, setMental] = useState<CapacityLevel | null>(null);
  const [emotional, setEmotional] = useState<CapacityLevel | null>(null);

  const [input, setInput] = useState('');
  const [severity, setSeverity] = useState<StressorSeverity>(3);
  const [persistence, setPersistence] = useState<StressorPersistence>('repeated');
  const [category, setCategory] = useState<StressorCategory>('professional');
  const stressorInputRef = useRef<HTMLInputElement>(null);

  const [reducingId, setReducingId] = useState<string | null>(null);

  const uid = auth.currentUser?.uid;

  const load = async () => {
    if (isDemoSession) {
      setLatestCheckIn(DEMO_CAPACITY_CHECKIN);
      setStressors(DEMO_ENERGY_STRESSORS);
      setSnapshots(DEMO_DAILY_SNAPSHOTS);
      setLoading(false);
      return;
    }
    if (!uid) return;
    setLoading(true);
    try {
      const [checkIn, stressorList, snapshotList] = await Promise.all([
        loadLatestCapacityCheckIn(uid), loadStressors(uid), loadRecentDailySnapshots(uid),
      ]);
      setLatestCheckIn(checkIn);
      setStressors(stressorList);
      setSnapshots(snapshotList);
    } catch (e) {
      setError('Could not load your energy data.');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [uid, isDemoSession]);

  const activeStressors = useMemo(() => stressors.filter((s) => s.status === 'active'), [stressors]);
  const resolvedStressors = useMemo(() => stressors.filter((s) => s.status === 'resolved'), [stressors]);
  const capacity = latestCheckIn?.score ?? null;
  const hasCapacity = capacity !== null;
  const hasStressors = activeStressors.length > 0;

  const energy = useMemo(
    () => computeEnergyDelta(capacity ?? 0, activeStressors),
    [capacity, activeStressors]
  );
  const deltaState = hasCapacity ? getDeltaState(energy.energyDelta) : null;

  // Keeps today's snapshot current (section 9's "use the latest reading")
  // whenever capacity or the active stressor list actually changes -
  // never on every render, and never for a demo/sample session, which
  // has nothing real to persist.
  useEffect(() => {
    if (isDemoSession || !uid || (!hasCapacity && activeStressors.length === 0)) return;
    recordDailySnapshot(uid, capacity, activeStressors).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, isDemoSession, capacity, JSON.stringify(activeStressors.map((s) => [s.id, s.severity, s.persistence, s.reduction]))]);

  // Today's live-computed numbers, spliced in ahead of whatever history
  // was actually persisted for today (section 9 again) - the chart and
  // 7-day average always reflect what's on screen right now, never a
  // stale snapshot from earlier today.
  const sevenDayRecords: DailyEnergyRecord[] = useMemo(() => {
    const historical = snapshots.filter((s) => s.date !== todayDateKey());
    const todayRecord: DailyEnergyRecord = {
      date: todayDateKey(),
      capacity,
      grossLoad: energy.grossLoad,
      netLoad: energy.netLoad,
      capacityProtected: energy.capacityProtected,
      energyDelta: hasCapacity ? energy.energyDelta : null,
    };
    return [...historical, todayRecord].slice(-7);
  }, [snapshots, capacity, energy, hasCapacity]);

  const sevenDayDelta = useMemo(() => computeSevenDayDelta(sevenDayRecords), [sevenDayRecords]);
  const hasEnoughPatternData = sevenDayRecords.filter((d) => d.energyDelta !== null).length >= MIN_VALID_DAYS_FOR_PATTERN;
  const sustainedGap = useMemo(() => detectSustainedCapacityGap(sevenDayRecords), [sevenDayRecords]);
  const strainedDayCount = useMemo(() => countStrainedDays(sevenDayRecords), [sevenDayRecords]);
  const validDayCount = sevenDayRecords.filter((d) => d.energyDelta !== null).length;

  const resetCheckInForm = () => {
    setPhysical(null); setMental(null); setEmotional(null); setShowCheckIn(false);
  };

  const submitCheckIn = async () => {
    if (!physical || !mental || !emotional) return;
    const checkIn = { physical, mental, emotional };
    const score = computeCapacityScore(checkIn);
    if (isDemoSession || !uid) {
      setLatestCheckIn({ id: `local-${Date.now()}`, ...checkIn, score, createdAt: new Date().toISOString() });
      resetCheckInForm();
      return;
    }
    try {
      const record = await recordCapacityCheckIn(uid, checkIn);
      setLatestCheckIn(record);
      onPointsEarned(10, 'Checked in on capacity');
      updateNovaMemoryBySourceAndType('Energy Budget Matrix', 'state', {
        content: `Checked in capacity: ${score}/100 (${describeCapacity(score)}).`,
        confidence: 'verified',
        canEdit: true,
      });
    } catch (e) {
      setError('Could not save that check-in.');
    }
    resetCheckInForm();
  };

  const submitStressor = async () => {
    if (!input.trim() || !uid) return;
    const name = input.trim();
    if (isDemoSession) {
      setStressors((prev) => [{ id: `local-${Date.now()}`, name, category, severity, persistence, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev]);
      setInput('');
      return;
    }
    try {
      const newStressor = await addStressor(uid, { name, category, severity, persistence });
      setStressors((prev) => [newStressor, ...prev]);
      setInput('');
      onPointsEarned(20, `Logged into Energy Audit: ${name}`);
      updateNovaMemoryBySourceAndType('Energy Budget Matrix', 'state', {
        content: `Logged a stressor: "${name}" (${STRESSOR_CATEGORY_LABELS[category]}, ${STRESSOR_SEVERITY_LABELS[severity]} · ${STRESSOR_PERSISTENCE_LABELS[persistence]}).`,
        confidence: 'verified',
        canEdit: true,
      });
    } catch (e) {
      setError('This entry could not be saved.');
    }
  };

  const handleReduction = async (stressorId: string, reduction: ReductionLevel) => {
    const target = stressors.find((s) => s.id === stressorId);
    setReducingId(null);
    if (!target) return;
    if (target.isSample || isDemoSession) {
      setStressors((prev) => prev.map((s) => (s.id === stressorId ? { ...s, reduction } : s)));
      return;
    }
    if (!uid) return;
    setStressors((prev) => prev.map((s) => (s.id === stressorId ? { ...s, reduction } : s)));
    try {
      await reportStressorReduction(uid, stressorId, reduction);
      if (reduction !== 'not_yet') {
        onPointsEarned(25, `Protected capacity on: ${target.name}`);
      }
    } catch (e) {
      setError('Could not save that update.');
    }
  };

  const handleClassify = async (stressorId: string, action: StressorAction) => {
    const target = stressors.find((s) => s.id === stressorId);
    if (!target) return;
    if (target.isSample || isDemoSession) {
      setStressors((prev) => prev.map((s) => (s.id === stressorId ? { ...s, action } : s)));
      return;
    }
    if (!uid) return;
    setStressors((prev) => prev.map((s) => (s.id === stressorId ? { ...s, action } : s)));
    try {
      await classifyStressor(uid, stressorId, action);
    } catch (e) {
      setError('Could not save that update.');
    }
  };

  const handleResolve = async (stressorId: string) => {
    const target = stressors.find((s) => s.id === stressorId);
    if (!target) return;
    if (target.isSample || isDemoSession) {
      setStressors((prev) => prev.map((s) => (s.id === stressorId ? { ...s, status: 'resolved' } : s)));
      return;
    }
    if (!uid) return;
    onPointsEarned(15, `Resolved: ${target.name}`);
    setStressors((prev) => prev.map((s) => (s.id === stressorId ? { ...s, status: 'resolved' } : s)));
    try {
      await resolveStressor(uid, stressorId);
    } catch (e) {
      setError('Could not save that update.');
    }
  };

  const handleDelete = async (stressorId: string) => {
    const target = stressors.find((s) => s.id === stressorId);
    if (!target) return;
    setStressors((prev) => prev.filter((s) => s.id !== stressorId));
    if (target.isSample || isDemoSession || !uid) return;
    try {
      await deleteStressor(uid, stressorId);
    } catch (e) {
      setError('Could not remove that entry.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-24 font-sans max-w-[1400px] mx-auto">
      {error && (
        <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-xl">{error}</div>
      )}
      {/* Executive Header */}
      <div className="relative overflow-hidden rounded-xl bg-background border border-border p-6 sm:p-8 md:p-10">
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="flex items-center gap-4">
             <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
               <BatteryCharging className="w-7 h-7" />
             </div>
             <div>
                <h2 className="text-3xl lg:text-4xl font-display font-bold text-text-main tracking-tight">Energy &amp; Capacity</h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5"><Network className="w-3 h-3" /> Energy Delta Management · Core Pillar: Rebuild</span>
                </div>
             </div>
          </div>
          <div className="max-w-2xl border-l-[3px] border-primary/30 pl-5 py-1 space-y-1.5">
            <p className="text-base lg:text-lg text-text-main font-display font-bold">Your energy has a budget too.</p>
            <p className="text-sm lg:text-base text-text-muted leading-relaxed">
              Burnout can build when your demands repeatedly outrun the capacity available to meet them. Spot the gap, reduce unnecessary load and protect recovery.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Capacity + Log a stressor */}
        <div className="lg:col-span-4 space-y-8">
          <div className="card bg-card border border-border p-8 space-y-6 relative overflow-hidden">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted flex items-center justify-between">
              <span>Your Capacity</span>
              <Activity className="w-4 h-4 text-text-muted" />
            </h4>

            {!showCheckIn && (
              hasCapacity ? (
                <div className="space-y-4">
                  <div className="flex items-end gap-2">
                    <span className="text-5xl font-black font-display tracking-tighter text-text-main">{capacity}</span>
                    <span className="text-lg text-text-muted font-medium mb-1">/ 100</span>
                  </div>
                  <p className="text-sm font-bold text-text-main">{describeCapacity(capacity!)}</p>
                  <button onClick={() => setShowCheckIn(true)} className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary hover:underline">
                    <RefreshCw className="w-3.5 h-3.5" /> Capacity changed? Check in again
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-center py-4">
                  <p className="text-sm font-bold text-text-main">Not checked in yet</p>
                  <p className="text-xs text-text-muted leading-relaxed">Take a short check-in to establish your current load and recovery baseline.</p>
                  <button onClick={() => setShowCheckIn(true)} className="btn-primary py-3 px-6 text-xs font-black uppercase tracking-widest">
                    How is your capacity today?
                  </button>
                </div>
              )
            )}

            {showCheckIn && (
              <div className="space-y-5">
                <CapacityQuestion label="Physical energy" value={physical} onChange={setPhysical} />
                <CapacityQuestion label="Mental bandwidth" value={mental} onChange={setMental} />
                <CapacityQuestion label="Emotional capacity" value={emotional} onChange={setEmotional} />
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={submitCheckIn}
                    disabled={!physical || !mental || !emotional}
                    className="btn-primary py-3 px-6 text-xs font-black uppercase tracking-widest disabled:opacity-40"
                  >
                    Save check-in
                  </button>
                  <button onClick={resetCheckInForm} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card bg-background border-white/[0.05] p-8 space-y-6 shadow-xl">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted border-b border-white/5 pb-4">Log a Stressor</h4>

            <div className="space-y-6">
               <div className="space-y-2">
                 <label htmlFor="energy-matrix-stressor" className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">What's draining your energy?</label>
                 <input
                   id="energy-matrix-stressor"
                   ref={stressorInputRef}
                   type="text"
                   value={input}
                   onChange={(e) => setInput(e.target.value)}
                   placeholder="e.g. Hostile code review..."
                   className="w-full bg-surface border border-white/10 rounded-xl px-4 py-4 text-sm text-text-main placeholder:text-text-muted focus:ring-1 focus:ring-primary/50 focus:border-primary outline-none transition-all font-mono"
                 />
               </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">How much is this affecting you?</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {STRESSOR_SEVERITY_ORDER.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeverity(s)}
                      aria-pressed={severity === s}
                      className={cn(
                        "text-xs font-bold py-2.5 px-3 rounded-xl border transition-all text-left",
                        severity === s ? "bg-primary/20 border-primary/50 text-primary shadow-inner" : "bg-card border-border text-text-muted hover:border-border"
                      )}
                    >
                      {STRESSOR_SEVERITY_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Is this...</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {STRESSOR_PERSISTENCE_ORDER.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPersistence(p)}
                      aria-pressed={persistence === p}
                      className={cn(
                        "text-[11px] font-black uppercase tracking-widest py-2.5 px-2 rounded-xl border transition-all",
                        persistence === p ? "bg-primary/20 border-primary/50 text-primary shadow-inner" : "bg-card border-border text-text-muted hover:border-border"
                      )}
                    >
                      {STRESSOR_PERSISTENCE_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                 <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Category</label>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                   {(['professional', 'emotional', 'social', 'logistical'] as const).map(type => (
                     <button
                       key={type}
                       onClick={() => setCategory(type)}
                       aria-pressed={category === type}
                       className={cn(
                         "text-[11px] font-black uppercase tracking-widest py-3 px-3 rounded-xl border transition-all",
                         category === type ? "bg-primary/20 border-primary/50 text-primary shadow-inner" : "bg-card border-border text-text-muted hover:border-border"
                       )}
                     >
                       {STRESSOR_CATEGORY_LABELS[type]}
                     </button>
                   ))}
                 </div>
              </div>

              <button
                onClick={submitStressor}
                disabled={!input.trim()}
                className="w-full bg-surface dark:bg-card text-text-main py-4 rounded-xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-[0.2em] disabled:opacity-40 hover:bg-border transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                <Crosshair className="w-4 h-4" /> Add to Energy Audit
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Dashboard + Pattern + Audit */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <EnergyDashboard
            hasCapacity={hasCapacity}
            capacity={capacity}
            hasStressors={hasStressors}
            netLoad={energy.netLoad}
            capacityProtected={energy.capacityProtected}
            deltaState={deltaState}
            energyDelta={hasCapacity ? energy.energyDelta : null}
          />

          {sustainedGap && (
            <div className="bg-destructive/10 rounded-2xl p-6 border border-destructive/20 flex items-start gap-4 shadow-inner">
              <BatteryWarning className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-black text-destructive">You're spending more than you're recovering</p>
                <p className="text-xs text-rose-200/80 leading-relaxed">
                  Your recent check-ins show demand repeatedly running ahead of available capacity ({strainedDayCount} of your last {validDayCount} check-ins showed more demand than available capacity).
                </p>
                <p className="text-xs font-bold text-text-muted">Your recent pattern is showing sustained pressure - not a diagnosis, just what the numbers are showing.</p>
              </div>
            </div>
          )}

          <SevenDayPatternCard records={sevenDayRecords} hasEnoughData={hasEnoughPatternData} sevenDayDelta={sevenDayDelta} />

          <EnergyAuditCard
            activeStressors={activeStressors}
            resolvedStressors={resolvedStressors}
            reducingId={reducingId}
            setReducingId={setReducingId}
            onReduction={handleReduction}
            onClassify={handleClassify}
            onResolve={handleResolve}
            onDelete={handleDelete}
            onFocusInput={() => stressorInputRef.current?.focus()}
          />
        </div>
      </div>
    </div>
  );
};

// ---------- Subcomponents ----------

const CapacityQuestion = ({ label, value, onChange }: { label: string; value: CapacityLevel | null; onChange: (v: CapacityLevel) => void }) => (
  <div className="space-y-2">
    <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">{label}</label>
    <div className="grid grid-cols-5 gap-1.5">
      {CAPACITY_LEVEL_ORDER.map((level) => (
        <button
          key={level}
          onClick={() => onChange(level)}
          aria-pressed={value === level}
          title={CAPACITY_LEVEL_LABELS[level]}
          className={cn(
            "text-[10px] font-black uppercase tracking-wider py-2.5 rounded-lg border transition-all",
            value === level ? "bg-primary/20 border-primary/50 text-primary shadow-inner" : "bg-card border-border text-text-muted hover:border-border"
          )}
        >
          {CAPACITY_LEVEL_LABELS[level].slice(0, 4)}
        </button>
      ))}
    </div>
  </div>
);

const EnergyDashboard = ({
  hasCapacity, capacity, hasStressors, netLoad, capacityProtected, deltaState, energyDelta,
}: {
  hasCapacity: boolean; capacity: number | null; hasStressors: boolean; netLoad: number; capacityProtected: number;
  deltaState: ReturnType<typeof getDeltaState> | null; energyDelta: number | null;
}) => (
  <div className="card bg-background p-8 border border-border space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <StatTile label="Current Capacity" value={hasCapacity ? `${capacity}` : null} emptyText="Not checked in yet" suffix="/ 100" />
      <StatTile label="Current Load" value={hasStressors ? `${Math.round(netLoad)}` : null} emptyText="No stressors logged" suffix="/ 100" />
      <StatTile label="Capacity Protected" value={capacityProtected > 0 ? `+${Math.round(capacityProtected)}` : null} emptyText="Not yet" />
    </div>

    <div className="pt-6 border-t border-border/40">
      {!hasCapacity ? (
        <p className="text-sm text-text-muted">Check in on your capacity to see your Energy Delta.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="text-xs font-black uppercase tracking-widest text-text-muted">Energy Delta</span>
            <span className={cn("text-3xl font-display font-black tracking-tighter", (energyDelta ?? 0) < 0 ? 'text-destructive' : 'text-primary')}>
              {(energyDelta ?? 0) > 0 ? '+' : ''}{Math.round(energyDelta ?? 0)}
            </span>
            <span className="text-sm font-bold text-text-main">{deltaState?.label}</span>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">{deltaState?.description}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {deltaState?.actions.map((action) => (
              <span key={action} className="text-[11px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full">
                {action}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
);

const StatTile = ({ label, value, emptyText, suffix }: { label: string; value: string | null; emptyText: string; suffix?: string }) => (
  <div className="space-y-1.5">
    <p className="text-[11px] font-black uppercase tracking-widest text-text-muted">{label}</p>
    {value !== null ? (
      <p className="text-3xl font-display font-black tracking-tighter text-text-main">
        {value}{suffix && <span className="text-sm text-text-muted font-medium ml-1">{suffix}</span>}
      </p>
    ) : (
      <p className="text-sm font-bold text-text-muted">{emptyText}</p>
    )}
  </div>
);

const SevenDayPatternCard = ({
  records, hasEnoughData, sevenDayDelta,
}: { records: DailyEnergyRecord[]; hasEnoughData: boolean; sevenDayDelta: number | null }) => {
  const chartData = records.map((r) => ({
    day: new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
    capacity: r.capacity,
    load: r.netLoad,
  }));

  return (
    <div className="card bg-background p-8 border border-border space-y-6 text-text-main relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">Your 7-Day Energy Pattern</h4>
          <p className="text-[10px] text-text-muted mt-0.5">Based on what you've logged here - not a biometric or device reading.</p>
        </div>
        <Activity className="w-4 h-4 text-text-muted shrink-0" />
      </div>

      {!hasEnoughData ? (
        <div className="h-56 flex flex-col items-center justify-center text-center gap-2 px-4">
          <p className="text-sm font-bold text-text-main">Building your energy picture</p>
          <p className="text-xs text-text-muted leading-relaxed max-w-[320px]">
            Keep checking in and Blaze Break will start showing what repeatedly drains and restores your capacity.
          </p>
        </div>
      ) : (
        <>
          <div className="h-56 w-full font-mono text-xs">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#475569" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#475569" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '12px', fontSize: '12px' }}
                  itemStyle={{ fontWeight: 'bold' }}
                  labelStyle={{ color: '#64748b', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                />
                <Area type="monotone" dataKey="load" name="Load" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorLoad)" connectNulls />
                <Line type="monotone" dataKey="capacity" name="Capacity" stroke="#818cf8" strokeWidth={3} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {sevenDayDelta !== null && (
            <div className="pt-4 border-t border-border/40">
              <p className="text-xs font-black uppercase tracking-widest text-text-muted">7-Day Pattern</p>
              <p className="text-sm font-bold text-text-main mt-1">
                {sevenDayDelta < -10 ? 'Demand is consistently exceeding capacity' : sevenDayDelta < 0 ? 'Demand is slightly ahead of capacity' : 'Capacity has generally kept up with demand'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const EnergyAuditCard = ({
  activeStressors, resolvedStressors, reducingId, setReducingId, onReduction, onClassify, onResolve, onDelete, onFocusInput,
}: {
  activeStressors: Stressor[]; resolvedStressors: Stressor[]; reducingId: string | null; setReducingId: (id: string | null) => void;
  onReduction: (id: string, r: ReductionLevel) => void; onClassify: (id: string, a: StressorAction) => void;
  onResolve: (id: string) => void; onDelete: (id: string) => void; onFocusInput: () => void;
}) => (
  <div className="card bg-card border border-border p-8 flex-1 space-y-6">
    <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
      <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">Energy Audit</h4>
      <span className="text-xs font-mono text-text-muted bg-card px-3 py-1 rounded">{activeStressors.length} entries</span>
    </div>

    <div className="space-y-4">
      <AnimatePresence>
        {activeStressors.map((s) => (
          <motion.div
            key={s.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col gap-4 p-5 rounded-2xl border border-white/[0.05] bg-background/50 hover:bg-background hover:border-primary/30 transition-all shadow-sm"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h5 className="font-bold text-text-main tracking-tight">{s.name}</h5>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px] uppercase tracking-widest text-text-muted font-black">{STRESSOR_CATEGORY_LABELS[s.category]}</span>
                  <span className="text-[10px] text-text-muted">·</span>
                  <span className="text-[11px] uppercase tracking-widest text-text-muted font-black">{STRESSOR_SEVERITY_LABELS[s.severity]} · {STRESSOR_PERSISTENCE_LABELS[s.persistence]}</span>
                  {s.reduction && s.reduction !== 'not_yet' && (
                    <span className="text-[10px] uppercase tracking-widest font-black text-[#9a3412] dark:text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                      {REDUCTION_LEVEL_LABELS[s.reduction]} reduced
                    </span>
                  )}
                  {s.isSample && (
                    <span className="text-[10px] uppercase tracking-widest font-black text-[#9a3412] dark:text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">Sample</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setReducingId(reducingId === s.id ? null : s.id)} className="px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20">
                  Reduce
                </button>
                <button onClick={() => onResolve(s.id)} className="px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-success/10 text-success hover:bg-success/20 transition-colors border border-success/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                </button>
                <button onClick={() => onDelete(s.id)} aria-label={`Remove ${s.name}`} className="p-2.5 rounded-xl text-text-muted hover:text-destructive hover:bg-destructive/10 transition-colors border border-transparent hover:border-destructive/20">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {reducingId === s.id && (
              <div className="space-y-2 pt-3 border-t border-white/[0.05]">
                <p className="text-xs font-bold text-text-main">Did this reduce the demand?</p>
                <div className="flex flex-wrap gap-2">
                  {REDUCTION_LEVEL_ORDER.map((r) => (
                    <button
                      key={r}
                      onClick={() => onReduction(s.id, r)}
                      className="px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-xs font-bold text-text-main transition-all"
                    >
                      {REDUCTION_LEVEL_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1">
              {(Object.keys(STRESSOR_ACTION_LABELS) as StressorAction[]).map((a) => (
                <button
                  key={a}
                  onClick={() => onClassify(s.id, a)}
                  aria-pressed={s.action === a}
                  className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border transition-all",
                    s.action === a ? "bg-primary/20 border-primary/50 text-primary" : "bg-card border-border text-text-muted hover:border-border"
                  )}
                >
                  {STRESSOR_ACTION_LABELS[a]}
                </button>
              ))}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {activeStressors.length === 0 && (
        <div className="py-16 text-center text-text-muted bg-surface rounded-xl border border-border space-y-4">
          <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
          <p className="font-medium text-sm">No energy drains logged yet.</p>
          <button onClick={onFocusInput} className="text-xs font-black uppercase tracking-widest text-primary hover:underline">
            Log your first one
          </button>
        </div>
      )}
    </div>

    {resolvedStressors.length > 0 && (
      <div className="pt-8 mt-8 border-t border-white/[0.05]">
        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted mb-5 flex items-center gap-2">
          <TrendingDown className="w-3.5 h-3.5 text-success" /> Resolved ({resolvedStressors.length})
        </h4>
        <div className="flex flex-wrap gap-3">
          {resolvedStressors.map((s) => (
            <motion.div
              key={s.id}
              layout
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="px-3.5 py-2 rounded-lg bg-background border border-white/5 text-xs font-bold text-text-muted flex items-center gap-3 shadow-inner"
            >
              <span className="line-through opacity-70">{s.name}</span>
              {s.action && (
                <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest font-black bg-primary/20 text-primary">
                  {STRESSOR_ACTION_LABELS[s.action]}
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    )}
  </div>
);

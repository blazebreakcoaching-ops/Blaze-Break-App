import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { collection, doc, setDoc, getDocs, updateDoc, deleteDoc, deleteField, query, orderBy } from 'firebase/firestore';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, BatteryFull, Zap, Waves, Users, X, AlertCircle, History, CheckCircle2, PieChart, Loader2 } from 'lucide-react';
import { useFocusTrap } from '../lib/useFocusTrap';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { EnergyCredit } from '../types.ts';
import { cn } from '../lib/utils.ts';
import { logJourney } from '../lib/nova-brain.ts';
import { ShipJourney } from './ShipJourney';
import { RelapseRadar } from './RelapseRadar';
import { DebtTracker } from './DebtTracker';
import { SHIPStage } from '../types';
import { loadLatestCapacityCheckIn } from '../lib/energy-delta-service';
import { saturate } from '../../energy-delta-engine';
import { DEMO_PLANNED_TASKS, DEMO_CAPACITY_CHECKIN } from '../lib/demo-data';

// Today's Capacity Plan - the same Energy Delta model as the Energy &
// Capacity tool above it on this tab (Capacity - Net Load = Energy
// Delta), applied to today's planned demands instead of ongoing
// stressors. No separate credit/budget system: Available Capacity comes
// from the same capacity check-in, and each task's load is derived from
// its strain severity rather than a freely-chosen number.

const SEVERITY_BASE_VALUES: Record<'High' | 'Medium' | 'Low', number> = { Low: 15, Medium: 30, High: 45 };

type TaskAction = NonNullable<EnergyCredit['action']>;

// How much of a task's load today's chosen action removes - mirrors the
// Energy Audit's reduction-level reasoning (section 4), just collapsed
// into a single action instead of a separate "how much" question, since
// here the action already implies the answer.
const ACTION_REDUCTION: Record<TaskAction, number> = {
  keep: 0, reduce: 0.3, delegate: 0.8, defer: 1, drop: 1,
};

const ACTION_LABELS: Record<TaskAction, string> = {
  keep: 'Keep', reduce: 'Reduce', delegate: 'Delegate', defer: 'Defer', drop: 'Drop',
};

const taskBaseValue = (t: Pick<EnergyCredit, 'priority'>): number => SEVERITY_BASE_VALUES[t.priority];
const taskNetValue = (t: Pick<EnergyCredit, 'priority' | 'action'>): number =>
  taskBaseValue(t) * (1 - (t.action ? ACTION_REDUCTION[t.action] : 0));

export const EnergyBudgetTool = ({
  onAwardPoints,
  currentStage = 'Safety',
  isDemoSession,
  committedActionIds = [],
  onCommitAction,
  onNavigate,
}: {
  onAwardPoints: (amount: number, reason: string) => void,
  currentStage?: SHIPStage,
  isDemoSession?: boolean,
  // Threaded straight through to ShipJourney below - see that file for
  // why quest completion reuses this existing field/callback rather than
  // a new Firestore collection.
  committedActionIds?: string[],
  onCommitAction?: (actionId: string) => void,
  onNavigate?: (tab: string) => void,
}) => {
  const STAGE_MAP: Record<SHIPStage, 'Safety' | 'Habits' | 'Identity' | 'Purpose'> = {
    Safety: 'Safety',
    Habits: 'Habits',
    Identity: 'Identity',
    Purpose: 'Purpose'
  };

  const [capacity, setCapacity] = useState<number | null>(null);
  const [tasks, setTasks] = useState<(EnergyCredit & { createdAt?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newType, setNewType] = useState<EnergyCredit['type']>('Executive');
  const [newPriority, setNewPriority] = useState<EnergyCredit['priority']>('Medium');
  const [newShipStage, setNewShipStage] = useState<'Safety' | 'Habits' | 'Identity' | 'Purpose'>('Safety');
  const [sortBy, setSortBy] = useState<'default' | 'drain-high' | 'drain-low' | 'ship-stage' | 'priority'>('default');
  const [hasCommitted, setHasCommitted] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const deleteDialogRef = useFocusTrap(!!taskToDelete);

  useEffect(() => {
    if (!taskToDelete) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setTaskToDelete(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [taskToDelete]);
  const [filterAction, setFilterAction] = useState<undefined | TaskAction>();

  const uid = auth.currentUser?.uid;

  const fetchAll = async () => {
    if (isDemoSession) {
      setTasks(DEMO_PLANNED_TASKS);
      setCapacity(DEMO_CAPACITY_CHECKIN.score);
      setLoading(false);
      return;
    }
    if (!uid) return;
    setLoading(true);
    try {
      const [creditsSnap, checkIn] = await Promise.all([
        getDocs(query(collection(db, 'users', uid, 'energy_credits'), orderBy('createdAt', 'desc'))),
        loadLatestCapacityCheckIn(uid),
      ]);
      setTasks(creditsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EnergyCredit & { createdAt?: string })));
      setCapacity(checkIn?.score ?? null);
    } catch (e) {
      setError('Could not load your capacity plan.');
    }
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, [uid, isDemoSession]);

  const activeTasks = useMemo(() => tasks.filter(t => t.action !== 'drop'), [tasks]);
  const droppedTasks = useMemo(() => tasks.filter(t => t.action === 'drop'), [tasks]);

  const grossLoad = useMemo(() => saturate(activeTasks.map(taskBaseValue)), [activeTasks]);
  const netLoad = useMemo(() => saturate(activeTasks.map(taskNetValue)), [activeTasks]);
  const capacityProtected = grossLoad - netLoad;
  const hasCapacity = capacity !== null;
  const energyDelta = hasCapacity ? capacity! - netLoad : null;
  const remainingBuffer = hasCapacity ? Math.max(0, capacity! - netLoad) : null;

  const toggleTaskAction = async (id: string, action: TaskAction) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const nextAction = task.action === action ? undefined : action;
    setTasks(current => current.map(t => t.id === id ? { ...t, action: nextAction } : t));
    if (isDemoSession || !uid) return;
    try {
      await updateDoc(doc(db, 'users', uid, 'energy_credits', id), { action: nextAction ?? deleteField(), updatedAt: new Date().toISOString() });
    } catch (e) {
      setError('This entry could not be saved.');
    }
  };

  const typeConfig: Record<string, { color: string, glow: string, icon: any }> = {
    Executive: { color: 'bg-card dark:bg-white', glow: 'shadow-muted-foreground/20', icon: Zap },
    Emotional: { color: 'bg-primary', glow: 'shadow-primary/20', icon: Waves },
    Social: { color: 'bg-text-main', glow: 'shadow-surface', icon: Users },
    Physical: { color: 'bg-teal-500', glow: 'shadow-teal-500/20', icon: BatteryFull },
  };

  // A short, honest read on where today's load is concentrated - never
  // claims a "Recovery Velocity Score" or any other measurement this
  // tool doesn't actually compute.
  const getAIAnalysis = () => {
    if (tasks.length === 0) return `"Add today's tasks below and I'll help you see where the load is concentrated."`;

    const highCostSocial = tasks.filter(t => t.cost >= 30 && (t.type === 'Social' || t.task.toLowerCase().includes('meeting')));
    const highCostExec = tasks.filter(t => t.cost >= 40 && t.type === 'Executive');

    if (highCostSocial.length > 0) {
      return `"Consider delegating or deferring '${highCostSocial[0].task}' - it's carrying a lot of today's load. Moving it would free up real capacity."`;
    } else if (highCostExec.length > 0) {
      return `"'${highCostExec[0].task}' is taking up a big share of your capacity today. Time-boxing it or breaking it into smaller pieces could help."`;
    }

    return `"Today's load looks reasonably balanced. Keep an eye on anything that comes up unexpectedly."`;
  };

  const sortedTasks = [...activeTasks]
    .filter(t => filterAction ? t.action === filterAction : true)
    .sort((a, b) => {
    if (sortBy === 'drain-high') {
      return b.cost - a.cost;
    }
    if (sortBy === 'drain-low') {
      return a.cost - b.cost;
    }
    if (sortBy === 'priority') {
      const priorityWeights = { High: 3, Medium: 2, Low: 1 };
      return (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0);
    }
    if (sortBy === 'ship-stage') {
      const stageWeights = { Safety: 4, Habits: 3, Identity: 2, Purpose: 1 };
      return (stageWeights[a.shipStage || 'Safety'] || 0) - (stageWeights[b.shipStage || 'Safety'] || 0);
    }
    return 0; // default order
  });

  const addTask = async () => {
    if (!newTaskName) return;

    const id = Date.now().toString();
    const createdAt = new Date().toISOString();
    const newTask: EnergyCredit & { createdAt?: string } = {
      id,
      task: newTaskName,
      type: newType as any,
      cost: SEVERITY_BASE_VALUES[newPriority],
      priority: newPriority,
      shipStage: newShipStage,
      createdAt,
    };

    setTasks(prev => [newTask, ...prev]);
    setNewTaskName('');

    if (isDemoSession || !uid) return;

    try {
      await setDoc(doc(db, 'users', uid, 'energy_credits', id), {
        createdAt,
        updatedAt: createdAt,
        task: newTask.task,
        cost: newTask.cost,
        priority: newTask.priority,
        type: newTask.type,
        shipStage: newTask.shipStage,
      });
    } catch (e) {
      setError('This entry could not be saved.');
      setTasks(prev => prev.filter(t => t.id !== id));
      return;
    }

    logJourney('Capacity Plan Update', `Added task: '${newTaskName}' (${newPriority} strain, ${newType})`);
    // Flat points regardless of SHIP-pillar match - the pillar tag (shown
    // as a "Phase Anchor" badge in the list below) is for the user's own
    // reference, not something that should be gamed for bonus points.
    onAwardPoints(10, 'Added to Today\'s Load');
  };

  const handleCommit = () => {
    if (!hasCommitted) {
      setHasCommitted(true);
      logJourney('Capacity Plan Update', `Locked today's plan with ${activeTasks.length} active tasks`);
      onAwardPoints(50, "Today's Plan Locked In");
    }
  };

  const removeTask = (id: string) => {
    const taskObj = tasks.find(t => t.id === id);
    if (taskObj) logJourney('Capacity Plan Update', `Removed task: '${taskObj.task}'`);
    setTaskToDelete(id);
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    const id = taskToDelete;
    setTaskToDelete(null);
    setTasks(current => current.filter(t => t.id !== id));
    if (isDemoSession || !uid) return;
    try {
      await deleteDoc(doc(db, 'users', uid, 'energy_credits', id));
    } catch (e) {
      setError('This entry could not be deleted.');
    }
  };

  const weeklyData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }).map((_, i) => {
      const daysAgo = 6 - i;
      const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayTasks = tasks.filter(t => t.createdAt?.startsWith(dateStr));
      const byType = { Executive: 0, Social: 0, Emotional: 0, Physical: 0 };
      dayTasks.forEach(t => { byType[t.type as keyof typeof byType] = (byType[t.type as keyof typeof byType] || 0) + t.cost; });
      const total = dayTasks.reduce((sum, t) => sum + t.cost, 0);
      return {
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        ...byType,
        total
      };
    });
  }, [tasks]);

  const overloadDays = hasCapacity ? weeklyData.filter(d => d.total > capacity!) : [];
  const safeDays = hasCapacity ? weeklyData.filter(d => d.total <= capacity! && d.total > 0) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-24">
      {error && (
        <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive dark:text-[#f87171] text-sm p-4 rounded-xl">{error}</div>
      )}
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           {/* "Energy & Capacity" is already the dominant heading on
               EnergyBudgetMatrix.tsx just above this on the Recover tab -
               this tag intentionally doesn't repeat it as a second
               competing section heading. */}
           <div className="tag">Energy Delta Management · Core Pillar: Rebuild</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="group/tooltip relative inline-flex items-center mb-4">
          <h3 className="text-4xl sm:text-5xl font-display font-medium text-text-main tracking-tight cursor-help underline decoration-primary/30 underline-offset-8 decoration-dashed">
            Today's Capacity Plan
          </h3>
          <div className="absolute left-0 top-full mt-4 p-4 w-80 bg-card text-text-main text-sm font-medium rounded-lg border border-border shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
            <div className="text-xs uppercase font-medium tracking-widest text-[#9a3412] dark:text-primary mb-2">What this shows</div>
            See where today's planned demand sits against the capacity you actually have. Add tasks below to see how they draw on it.
          </div>
        </div>
        <p className="text-xl text-text-muted font-medium mt-2">Plan today's tasks against the capacity you actually have.</p>
      </div>

      {/* SHIP Journey Phase */}
      <div className="relative">
        <ShipJourney
          currentStage={currentStage as any}
          committedActionIds={committedActionIds}
          onCommitAction={onCommitAction || (() => {})}
          onNavigate={onNavigate}
        />
      </div>

      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-8 space-y-10">
          <DebtTracker isDemoSession={isDemoSession} />

          {/* Recharts Stacked Weekly Allocation Chart */}
          <div className="card p-8 space-y-6 relative overflow-hidden border border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-display font-medium text-text-main">Weekly Energy Load</h3>
                <p className="text-xs uppercase font-medium tracking-[0.25em] text-text-muted mt-1">By category, over the last 7 days</p>
              </div>
              {hasCapacity && (
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-destructive dark:text-[#f87171]">
                    <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
                    Your Available Capacity
                  </div>
                </div>
              )}
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={weeklyData}
                  margin={{ top: 20, right: 10, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" className="dark:stroke-border" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: 'currentColor', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    className="text-text-muted"
                  />
                  <YAxis
                    tick={{ fill: 'currentColor', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    className="text-text-muted"
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#fff'
                    }}
                    itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                    labelStyle={{ fontSize: '11px', fontWeight: 'extrabold', color: '#fff', marginBottom: '4px' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="Executive" stackId="energy" fill="#312E81" />
                  <Bar dataKey="Social" stackId="energy" fill="#38BDF8" />
                  <Bar dataKey="Emotional" stackId="energy" fill="#14B8A6" />
                  <Bar dataKey="Physical" stackId="energy" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                  {hasCapacity && (
                    <ReferenceLine y={capacity!} stroke="#EF4444" strokeDasharray="5 5" label={{ value: `Your available capacity (${capacity})`, fill: '#EF4444', fontSize: 9, position: 'top', fontWeight: 'bold' }} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <div className="flex items-center gap-3 p-3 bg-destructive/5 dark:bg-destructive/10 rounded-xl border border-destructive/15">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <div className="text-xs leading-tight text-text-muted font-sans font-bold">
                  <span className="text-destructive dark:text-[#f87171] font-extrabold uppercase tracking-wide">Heads up:</span>{' '}
                  {!hasCapacity
                    ? 'Check in on your capacity to see this comparison.'
                    : overloadDays.length > 0
                      ? <>{overloadDays.map(d => d.day).join(' & ')} demand exceeded your available capacity that day.</>
                      : 'No days this week exceeded your available capacity.'}
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-success/5 dark:bg-success/10 rounded-xl border border-success/15">
                <CheckCircle2 className="w-5 h-5 text-success dark:text-[#4ade80]" />
                <div className="text-xs leading-tight text-text-muted font-sans font-bold">
                  <span className="text-success dark:text-[#4ade80] font-extrabold uppercase tracking-wide">Within capacity:</span>{' '}
                  {safeDays.length > 0
                    ? <>{safeDays.map(d => d.day).join(' & ')} stayed within your available capacity.</>
                    : 'No load logged yet this week.'}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 sm:p-8 md:p-10 space-y-8 relative overflow-hidden border border-border">
            <div className="relative z-10">
              <h3 className="text-xl font-display font-medium text-text-main tracking-tight">Today's Capacity Plan</h3>
              <p className="text-xs text-text-muted uppercase tracking-[0.2em] font-medium mt-1">Capacity vs. planned demand</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 relative z-10">
              <StatTile label="Available Capacity" value={hasCapacity ? `${capacity}` : null} emptyText="Not checked in yet" />
              <StatTile label="Planned Load" value={activeTasks.length > 0 ? `${Math.round(netLoad)}` : null} emptyText="Nothing planned yet" />
              <StatTile label="Remaining Buffer" value={remainingBuffer !== null ? `${Math.round(remainingBuffer)}` : null} emptyText="Not checked in yet" />
              <StatTile label="Capacity Protected" value={capacityProtected > 0 ? `+${Math.round(capacityProtected)}` : null} emptyText="Not yet" />
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-text-muted">Energy Delta</p>
                {energyDelta !== null ? (
                  <p className={cn("text-3xl font-display font-black tracking-tighter", energyDelta < 0 ? 'text-destructive' : 'text-primary')}>
                    {energyDelta > 0 ? '+' : ''}{Math.round(energyDelta)}
                  </p>
                ) : (
                  <p className="text-sm font-bold text-text-muted">Not checked in yet</p>
                )}
              </div>
            </div>

            {activeTasks.length > 0 && (
              <div className="h-4 bg-surface/50 rounded-full overflow-hidden flex shadow-inner border border-border/20 p-0.5 relative z-10">
                {activeTasks.map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ width: 0 }}
                    animate={{ width: `${taskNetValue(task)}%` }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(typeConfig[task.type]?.color || 'bg-surface', "h-full first:rounded-l-full last:rounded-r-full border-r border-black/10")}
                  />
                ))}
              </div>
            )}

            {!hasCapacity && (
              <p className="text-xs text-text-muted relative z-10">Check in on your capacity in Energy &amp; Capacity above to see your Energy Delta and Remaining Buffer here.</p>
            )}
            {hasCapacity && energyDelta !== null && energyDelta < 0 && (
              <p className="text-xs text-text-muted relative z-10">You've planned more demand than today's available capacity currently supports.</p>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-text-muted" />
                <h4 className="text-[11px] font-black text-text-muted uppercase tracking-[0.3em]">Today's Load</h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase font-black tracking-widest text-text-muted ">Sort Filters:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort filters"
                  className="bg-white/5 dark:bg-card border border-border/40 rounded-xl px-3 py-1.5 text-xs text-text-main font-bold uppercase tracking-wider focus:outline-none focus:border-primary cursor-pointer shadow-sm"
                >
                  <option value="default">Default Sync Order</option>
                  <option value="drain-high">Energy Drain (High ➜ Low)</option>
                  <option value="drain-low">Energy Drain (Low ➜ High)</option>
                  <option value="priority">Strain Severity (High ➜ Low)</option>
                  <option value="ship-stage">SHIP Pillar Alignment</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setFilterAction(undefined)} aria-pressed={!filterAction} className={cn("px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all", !filterAction ? "bg-primary text-primary-foreground dark:bg-border dark:text-text-main" : "bg-surface text-text-muted hover:bg-border dark:bg-white/5 dark:hover:bg-white/10 dark:text-text-muted")}>All Load</button>
              {(['keep', 'reduce', 'delegate', 'defer'] as const).map((action) => (
                <button key={action} onClick={() => setFilterAction(action)} aria-pressed={filterAction === action} className={cn("px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all", filterAction === action ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-surface text-text-muted hover:bg-border dark:bg-white/5 dark:hover:bg-white/10 dark:text-text-muted")}>{ACTION_LABELS[action]}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4">
              <AnimatePresence mode="popLayout">
                {sortedTasks.map(task => {
                  const config = typeConfig[task.type] || { color: 'bg-surface', glow: '', icon: Zap };
                  const Icon = config.icon;
                  const currentActiveStage = STAGE_MAP[currentStage] || 'Safety';
                  const isAnchor = task.shipStage === currentActiveStage;
                  return (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9, x: -20 }}
                      className={cn(
                        "flex items-center gap-6 p-6 border rounded-[2.5rem] transition-all duration-500 group relative overflow-hidden",
                        isAnchor
                          ? "bg-success/5 hover:bg-success/10 border-success/30"
                          : "bg-surface/40 hover:bg-card border-border/40"
                      )}
                    >
                      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-text-main shadow-xl relative z-10 transition-transform group-hover:scale-110 duration-500", config.color, config.glow)}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 relative z-10">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-xl font-display font-bold text-text-main tracking-tight group-hover:text-[#9a3412] dark:group-hover:text-primary transition-colors">{task.task}</p>
                          <span className={cn(
                            "text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-[0.2em] shadow-sm",
                            task.priority === 'High' ? "bg-destructive text-destructive-foreground" :
                            task.priority === 'Medium' ? "bg-warning text-text-main" :
                            "bg-border text-text-muted"
                          )}>
                            {task.priority}
                          </span>
                          {task.shipStage && (
                            <span className="text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-[0.2em] bg-primary/10 text-[#9a3412] dark:text-primary border border-primary/25">
                              {task.shipStage}
                            </span>
                          )}
                          {isAnchor && (
                            <span className="text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-[0.2em] bg-success text-white border border-success shadow-sm animate-pulse">
                              Phase Anchor
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.2em] font-black text-text-muted  mt-1.5">{task.type}</p>
                      </div>
                      <div className="flex flex-col gap-1 relative z-10 border-l border-border/40 pl-6 mr-2">
                         {(['keep', 'reduce', 'delegate', 'defer', 'drop'] as const).map((action) => (
                           <button
                             key={action}
                             onClick={() => toggleTaskAction(task.id, action)}
                             aria-pressed={task.action === action}
                             className={cn(
                               "text-[11px] font-black uppercase tracking-widest px-2 py-1 rounded transition-all w-20 text-center",
                               task.action === action ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-text-muted hover:bg-primary/10"
                             )}
                           >
                             {ACTION_LABELS[action]}
                           </button>
                         ))}
                      </div>
                      <button
                        onClick={() => removeTask(task.id)}
                        aria-label={`Remove ${task.type} task`}
                        className="p-4 text-text-muted hover:text-destructive dark:hover:text-[#f87171] hover:bg-destructive/5 rounded-full transition-all relative z-10 group-hover:opacity-100 opacity-0"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {tasks.length === 0 && (
                <div className="p-20 text-center border-2 border-dashed border-border rounded-xl space-y-4">
                   <div className="w-16 h-16 bg-surface mx-auto rounded-xl flex items-center justify-center text-text-muted">
                      <Zap className="w-7 h-7" />
                   </div>
                   <p className="text-text-muted font-medium">Nothing planned yet — today's load is at baseline.</p>
                </div>
              )}
              {droppedTasks.length > 0 && (
                <div className="pt-4 flex flex-wrap gap-2">
                  {droppedTasks.map((t) => (
                    <span key={t.id} className="px-3 py-1.5 rounded-lg bg-surface border border-border/40 text-xs font-bold text-text-muted line-through">{t.task}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-10">
          <RelapseRadar />

          <div className="card p-6 sm:p-8 md:p-10 space-y-8 border border-primary/20 relative overflow-hidden group">
            <div className="relative z-10 space-y-8">
              <div className="flex items-center gap-3">
                 <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                 <h4 className="text-xs font-medium text-text-muted uppercase tracking-[0.3em]">Add a Task</h4>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <p className="text-xs uppercase font-black tracking-widest text-text-muted ">Load Description</p>
                  <input
                    type="text"
                    aria-label="Load description"
                    value={newTaskName}
                    onChange={e => setNewTaskName(e.target.value)}
                    placeholder="Enter activity..."
                    className="w-full bg-surface/40 border border-border shadow-inner rounded-[2rem] px-8 py-5 text-lg font-display font-bold focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-text-main placeholder:"
                  />
                </div>

                <div className="space-y-4">
                  <p className="text-xs uppercase font-black tracking-widest text-text-muted ">Category</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.keys(typeConfig).map(type => (
                      <button
                        key={type}
                        onClick={() => setNewType(type as any)}
                        aria-pressed={newType === type}
                        className={cn(
                          "py-4 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all",
                          newType === type
                            ? "bg-primary text-primary-foreground border-primary shadow-xl shadow-primary/30 scale-[1.02]"
                            : "bg-surface/40 text-text-muted border-border/40 hover:border-border dark:hover:border-border"
                        )}
                      >
                        {type === 'Executive' ? 'Executive / Work' : type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs uppercase font-black tracking-widest text-text-muted ">Strain Severity</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(['High', 'Medium', 'Low'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setNewPriority(p)}
                        aria-pressed={newPriority === p}
                        className={cn(
                          "py-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all",
                          newPriority === p
                            ? "bg-card dark:bg-white text-text-main border-none shadow-xl scale-[1.02]"
                            : "bg-surface/40 text-text-muted border-border/40 hover:border-border"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs uppercase font-black tracking-widest text-text-muted ">SHIP Alignment Pillar</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['Safety', 'Habits', 'Identity', 'Purpose'] as const).map(stage => {
                      const currentActiveStage = STAGE_MAP[currentStage] || 'Safety';
                      const isMatched = stage === currentActiveStage;
                      return (
                        <button
                          key={stage}
                          onClick={() => setNewShipStage(stage)}
                          aria-pressed={newShipStage === stage}
                          aria-label={isMatched ? `${stage} (your active Recovery phase)` : stage}
                          className={cn(
                            "py-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all relative overflow-hidden",
                            newShipStage === stage
                              ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-[1.02]"
                              : "bg-surface/40 text-text-muted border-border/40 hover:border-border"
                          )}
                        >
                          <span className="relative z-10">{stage}</span>
                          {isMatched && (
                            <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-success rounded-full" title="Active Recovery Phase" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-text-muted  px-1 font-semibold italic">● Indicates your active Recovery phase pillar - a tag for your own reference, worth keeping in view as you plan.</p>
                </div>

                <div className="space-y-4 pt-2">
                  <button
                    onClick={addTask}
                    disabled={!newTaskName}
                    className="w-full btn-primary py-5 rounded-xl disabled:opacity-40 uppercase tracking-[0.2em] font-medium text-[11px] flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    Add Task <Plus className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleCommit}
                    disabled={hasCommitted}
                    className={cn(
                      "w-full py-5 rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] transition-all border",
                      hasCommitted
                        ? "bg-teal-500/10 text-teal-500 border-teal-500/20"
                        : "bg-surface/40 text-text-muted border-border hover:bg-white dark:hover:bg-surface disabled:opacity-30"
                    )}
                  >
                    {hasCommitted ? "Today's Plan Locked In" : "Lock In Today's Plan"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-8 space-y-4 border border-border bg-card text-text-main relative overflow-hidden">
            <div className="w-11 h-11 bg-primary/10 rounded-lg flex items-center justify-center text-primary relative z-10">
               <Zap className="w-5 h-5" />
            </div>
            <p className="font-serif italic text-text-muted text-sm leading-relaxed relative z-10">
               {getAIAnalysis()}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {taskToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-card/80 backdrop-blur-sm p-4"
            onClick={() => setTaskToDelete(null)}
          >
            <motion.div
              ref={deleteDialogRef as any}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-task-title"
              tabIndex={-1}
              className="card bg-card border border-border shadow-lg p-8 max-w-sm w-full relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative z-10 space-y-6">
                <div className="w-11 h-11 bg-destructive/10 rounded-lg flex items-center justify-center text-destructive">
                  <PieChart className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="delete-task-title" className="text-xl font-display font-medium text-text-main mb-2">Delete Task?</h3>
                  <p className="text-text-muted text-sm">
                    This removes it from today's plan for good. Are you sure?
                  </p>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setTaskToDelete(null)}
                    className="flex-1 px-4 py-3 bg-card text-text-muted rounded-xl font-bold hover:bg-surface transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDeleteTask}
                    className="flex-1 px-4 py-3 bg-destructive text-destructive-foreground rounded-xl font-bold hover:opacity-90 transition"
                  >
                    Delete Task
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatTile = ({ label, value, emptyText }: { label: string; value: string | null; emptyText: string }) => (
  <div className="space-y-1">
    <p className="text-[11px] font-black uppercase tracking-widest text-text-muted">{label}</p>
    {value !== null ? (
      <p className="text-3xl font-display font-bold text-[#9a3412] dark:text-primary">{value}</p>
    ) : (
      <p className="text-sm font-bold text-text-muted">{emptyText}</p>
    )}
  </div>
);

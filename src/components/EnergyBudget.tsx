import { auth, db } from '../lib/firebase';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField, query, orderBy } from 'firebase/firestore';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, BatteryFull, Zap, Waves, Users, X, AlertCircle, History, CheckCircle2, PieChart, Loader2 } from 'lucide-react';
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

export const EnergyBudgetTool = ({ 
  onAwardPoints, 
  currentStage = 'Safety',
  debts = []
}: { 
  onAwardPoints: (amount: number, reason: string) => void, 
  currentStage?: SHIPStage,
  debts?: any[]
}) => {
  const STAGE_MAP: Record<SHIPStage, 'Safety' | 'Habits' | 'Identity' | 'Purpose'> = {
    Safety: 'Safety',
    Habits: 'Habits',
    Identity: 'Identity',
    Purpose: 'Purpose'
  };

  const [budgetState, setBudgetState] = useState(60);
  const [tasks, setTasks] = useState<(EnergyCredit & { createdAt?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newType, setNewType] = useState<EnergyCredit['type']>('Executive');
  const [newPriority, setNewPriority] = useState<EnergyCredit['priority']>('Medium');
  const [newShipStage, setNewShipStage] = useState<'Safety' | 'Habits' | 'Identity' | 'Purpose'>('Safety');
  const [sortBy, setSortBy] = useState<'default' | 'drain-high' | 'drain-low' | 'ship-stage' | 'priority'>('default');
  const [newCost, setNewCost] = useState(10);
  const [hasCommitted, setHasCommitted] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const deleteDialogRef = useFocusTrap(!!taskToDelete);

  useEffect(() => {
    if (!taskToDelete) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setTaskToDelete(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [taskToDelete]);
  const [filterAction, setFilterAction] = useState<undefined | 'keep' | 'delegate' | 'defer'>();

  const uid = auth.currentUser?.uid;

  const fetchAll = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [creditsSnap, settingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'users', uid, 'energy_credits'), orderBy('createdAt', 'desc'))),
        getDoc(doc(db, 'users', uid, 'energy_credits_settings', 'current')),
      ]);
      setTasks(creditsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EnergyCredit & { createdAt?: string })));
      if (settingsSnap.exists()) {
        setBudgetState(settingsSnap.data().budget ?? 60);
      }
    } catch (e) {
      setError('Could not load your energy budget.');
    }
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, [uid]);

  const persistBudget = async (value: number) => {
    if (!uid) return;
    try {
      await setDoc(doc(db, 'users', uid, 'energy_credits_settings', 'current'), {
        budget: value,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError('This entry could not be saved.');
    }
  };

  const setBudget = (value: number) => {
    setBudgetState(value);
    persistBudget(value);
  };

  const budget = budgetState;

  const totalSpent = tasks.reduce((sum, t) => sum + t.cost, 0);
  const currentRatio = isNaN(totalSpent / budget) ? 0 : totalSpent / budget;
  const isOverBudget = totalSpent > budget;

  const toggleTaskAction = async (id: string, action: 'keep' | 'delegate' | 'defer') => {
    if (!uid) return;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const nextAction = task.action === action ? undefined : action;
    setTasks(current => current.map(t => t.id === id ? { ...t, action: nextAction } : t));
    try {
      await updateDoc(doc(db, 'users', uid, 'energy_credits', id), { action: nextAction ?? deleteField(), updatedAt: new Date().toISOString() });
    } catch (e) {
      setError('This entry could not be saved.');
    }
  };

  const typeConfig: Record<string, { color: string, glow: string, icon: any }> = {

    Executive: { color: 'bg-card dark:bg-white', glow: 'shadow-muted-foreground/20', icon: Zap },
    Creative: { color: 'bg-primary', glow: 'shadow-primary/20', icon: Waves },
    Social: { color: 'bg-text-main', glow: 'shadow-surface', icon: Users },
    Physical: { color: 'bg-teal-500', glow: 'shadow-teal-500/20', icon: BatteryFull },
  };

  // Analyze tasks for delegation
  const getAIAnalysis = () => {
    if (tasks.length === 0) return `"You have not loaded your schedule into the matrix yet. A baseline analysis requires data."`;
    
    // Find highest cost tasks that might be delegated
    const highCostSocial = tasks.filter(t => t.cost >= 20 && (t.type === 'Social' || t.task.toLowerCase().includes('meeting')));
    const highCostExec = tasks.filter(t => t.cost >= 25 && t.type === 'Executive');
    
    if (highCostSocial.length > 0) {
      return `"To improve your Recovery Velocity Score, I suggest delegating or deferring '${highCostSocial[0].task}'. It is currently consuming a significant portion of your energy cap. Reallocating this will stabilize your baseline."`;
    } else if (highCostExec.length > 0) {
      return `"Your executive function is heavily taxed by '${highCostExec[0].task}'. To protect your Recovery Velocity, consider time-boxing this or breaking it down into smaller micro-commitments."`;
    }
    
    return `"Your allocation matrix is well balanced. Continue monitoring for unexpected neuro-cognitive load."`;
  };

  const sortedTasks = [...tasks]
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
    if (!newTaskName || !uid) return;
    const currentActiveStage = STAGE_MAP[currentStage] || 'Safety';
    const isAnchor = currentActiveStage === newShipStage;

    const id = Date.now().toString();
    const createdAt = new Date().toISOString();
    const newTask: EnergyCredit & { createdAt?: string } = {
      id,
      task: newTaskName,
      type: newType as any,
      cost: newCost,
      priority: newPriority,
      shipStage: newShipStage,
      createdAt,
    };

    setTasks(prev => [newTask, ...prev]);
    setNewTaskName('');

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

    logJourney('Energy Budget Update', `Added task: '${newTaskName}' (Cost: ${newCost}, Type: ${newType})`);

    if (isAnchor) {
      onAwardPoints(25, `Phase Anchor Task Integrated (+15 bonus)`);
    } else {
      onAwardPoints(10, "Neural Load Assessment");
    }
  };

  const handleCommit = () => {
    if (!isOverBudget && !hasCommitted) {
      setHasCommitted(true);
      logJourney('Energy Budget Update', `Locked allocation matrix with ${tasks.length} tasks and ${totalSpent}/${budget} credits spent`);
      onAwardPoints(50, "Allocation Matrix Locked");
    }
  };

  const removeTask = (id: string) => {
    const taskObj = tasks.find(t => t.id === id);
    if(taskObj) logJourney('Energy Budget Update', `Removed task: '${taskObj.task}'`);
    setTaskToDelete(id);
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete || !uid) return;
    const id = taskToDelete;
    setTaskToDelete(null);
    setTasks(current => current.filter(t => t.id !== id));
    try {
      await deleteDoc(doc(db, 'users', uid, 'energy_credits', id));
    } catch (e) {
      setError('This entry could not be deleted.');
    }
  };

  const weeklyData = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const daysAgo = 6 - i;
      const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
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

  const overloadDays = weeklyData.filter(d => d.total > budget);
  const safeDays = weeklyData.filter(d => d.total <= budget && d.total > 0);

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
        <div className="bg-destructive/10 border border-destructive/20 text-destructive dark:text-[#f87171] text-sm p-4 rounded-xl">{error}</div>
      )}
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Energy & Capacity</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="group/tooltip relative inline-flex items-center mb-4">
          <h3 className="text-4xl sm:text-5xl font-display font-medium text-text-main tracking-tight cursor-help underline decoration-primary/30 underline-offset-8 decoration-dashed">
            Energy & Capacity
          </h3>
          <div className="absolute left-0 top-full mt-4 p-4 w-80 bg-card text-text-main text-sm font-medium rounded-lg border border-border shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
            <div className="text-xs uppercase font-medium tracking-widest text-primary mb-2">What this shows</div>
            See where your energy actually goes. Add daily tasks below to see how they draw down your total capacity.
          </div>
        </div>
        <p className="text-xl text-text-muted font-medium  mt-2">"Burnout is a resource allocation failure. Recovery is a structural redesign."</p>
      </div>

      {/* SHIP Journey Phase */}
      <div className="relative">
        <ShipJourney currentStage={currentStage as any} />
      </div>

      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-8 space-y-10">
          <DebtTracker debts={debts} />

          {/* Recharts Stacked Weekly Allocation Chart */}
          <div className="card p-8 space-y-6 relative overflow-hidden border border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-display font-medium text-text-main">Weekly Energy Load</h3>
                <p className="text-xs uppercase font-medium tracking-[0.25em] text-text-muted mt-1">By category, over the last 7 days</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-destructive">
                  <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
                  Overload Threshold
                </div>
              </div>
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
                  <ReferenceLine y={budget} stroke="#EF4444" strokeDasharray="5 5" label={{ value: `Capacitance limit (${budget} CR)`, fill: '#EF4444', fontSize: 9, position: 'top', fontWeight: 'bold' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <div className="flex items-center gap-3 p-3 bg-destructive/5 dark:bg-destructive/10 rounded-xl border border-destructive/15">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <div className="text-xs leading-tight text-text-muted font-sans font-bold">
                  <span className="text-destructive font-extrabold uppercase tracking-wide">System warning:</span>{' '}
                  {overloadDays.length > 0
                    ? <>{overloadDays.map(d => d.day).join(' & ')} active strain exceeded baseline capacitance. Autocortex recovery protocols activated.</>
                    : 'No days this week exceeded baseline capacitance.'}
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-success/5 dark:bg-success/10 rounded-xl border border-success/15">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <div className="text-xs leading-tight text-text-muted font-sans font-bold">
                  <span className="text-success font-extrabold uppercase tracking-wide">Weekend buffer check:</span>{' '}
                  {safeDays.length > 0
                    ? <>{safeDays.map(d => d.day).join(' & ')} load maintained safely under budget. High recharge score synchronized.</>
                    : 'No load logged yet this week.'}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 sm:p-8 md:p-10 space-y-10 relative overflow-hidden border border-border">
            <div className="flex items-center justify-between relative z-10">
              <div>
                <h3 className="text-xl font-display font-medium text-text-main tracking-tight">Daily Energy Budget</h3>
                <p className="text-xs text-text-muted uppercase tracking-[0.2em] font-medium mt-1">Available Daily Credits</p>
              </div>
              <div className="flex items-center gap-6 p-1 bg-surface rounded-full border border-border">
                <button
                  onClick={() => setBudget(Math.max(20, budget - 10))}
                  aria-label="Decrease daily credit budget by 10"
                  className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white dark:hover:bg-card transition-all text-text-muted hover:text-primary active:scale-90"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <div className="flex flex-col items-center min-w-[100px]" role="status" aria-live="polite" aria-atomic="true">
                  <motion.span 
                    key={budget}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="font-display text-4xl font-black text-text-main"
                  >
                    {budget}
                  </motion.span>
                </div>
                <button 
                  onClick={() => setBudget(budget + 10)}
                  aria-label="Increase daily credit budget by 10"
                  className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white dark:hover:bg-card transition-all text-text-muted hover:text-primary active:scale-90"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-6 relative z-10">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                   <p className="text-xs uppercase font-black tracking-[0.25e] text-text-muted">Total Resource Load</p>
                   <p className={cn("text-3xl font-display font-bold", isOverBudget ? 'text-destructive' : 'text-primary')}>
                      {totalSpent} <span className="text-base text-text-muted font-medium tracking-normal">/ {budget} credits</span>
                   </p>
                </div>
                {isOverBudget && (
                  <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="flex items-center gap-3 px-4 py-2 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive dark:text-[#f87171] text-xs font-black uppercase tracking-widest"
                  >
                     <AlertCircle className="w-4 h-4" /> System Overload Detected
                  </motion.div>
                )}
              </div>
              
              <div className="h-4 bg-surface/50 rounded-full overflow-hidden flex shadow-inner border border-border/20 p-0.5">
                {tasks.map((task, i) => (
                  <motion.div 
                    key={task.id} 
                    initial={{ width: 0 }}
                    animate={{ width: `${(task.cost / budget) * 100}%` }}
                    transition={{ delay: i * 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(typeConfig[task.type]?.color || 'bg-surface', "h-full first:rounded-l-full last:rounded-r-full border-r border-black/10")}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-text-muted" />
                <h4 className="text-[11px] font-black text-text-muted uppercase tracking-[0.3em]">Load Manifest</h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase font-black tracking-widest text-text-muted ">Sort Filters:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-white/5 dark:bg-card border border-border/40 rounded-xl px-3 py-1.5 text-xs text-text-main font-bold uppercase tracking-wider focus:outline-none focus:border-primary cursor-pointer shadow-sm"
                >
                  <option value="default">Default Sync Order</option>
                  <option value="drain-high">Energy Drain (High ➜ Low)</option>
                  <option value="drain-low">Energy Drain (Low ➜ High)</option>
                  <option value="priority">Load Severity (High ➜ Low)</option>
                  <option value="ship-stage">SHIP Pillar Alignment</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setFilterAction(undefined)} aria-pressed={!filterAction} className={cn("px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all", !filterAction ? "bg-primary text-primary-foreground dark:bg-border dark:text-text-main" : "bg-surface text-text-muted hover:bg-border dark:bg-white/5 dark:hover:bg-white/10 dark:text-text-muted")}>All Load</button>
              <button onClick={() => setFilterAction('keep')} aria-pressed={filterAction === 'keep'} className={cn("px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all", filterAction === 'keep' ? "bg-success text-white shadow-md shadow-success/20" : "bg-surface text-text-muted hover:bg-border dark:bg-white/5 dark:hover:bg-white/10 dark:text-text-muted")}>Keep</button>
              <button onClick={() => setFilterAction('delegate')} aria-pressed={filterAction === 'delegate'} className={cn("px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all", filterAction === 'delegate' ? "bg-warning text-warning-foreground shadow-md shadow-warning/20" : "bg-surface text-text-muted hover:bg-border dark:bg-white/5 dark:hover:bg-white/10 dark:text-text-muted")}>Delegate</button>
              <button onClick={() => setFilterAction('defer')} aria-pressed={filterAction === 'defer'} className={cn("px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all", filterAction === 'defer' ? "bg-destructive text-destructive-foreground shadow-md shadow-destructive/20" : "bg-surface text-text-muted hover:bg-border dark:bg-white/5 dark:hover:bg-white/10 dark:text-text-muted")}>Defer</button>
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
                          <p className="text-xl font-display font-bold text-text-main tracking-tight group-hover:text-primary transition-colors">{task.task}</p>
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
                      <div className="flex flex-col items-end gap-1 relative z-10 mr-4">
                        <span className="font-display font-black text-2xl text-text-main group-hover:scale-110 transition-transform">{task.cost}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-text-muted ">CR</span>
                      </div>
                      <div className="flex flex-col gap-1 relative z-10 border-l border-border/40 pl-6 mr-2">
                         <button onClick={() => toggleTaskAction(task.id, 'keep')} aria-pressed={task.action === 'keep'} className={cn("text-[11px] font-black uppercase tracking-widest px-2 py-1 rounded transition-all w-20 text-center", task.action === 'keep' ? "bg-success text-white shadow-md shadow-success/20" : "text-[#166534] dark:text-[#4ade80] hover:bg-success/10")}>Keep</button>
                         <button onClick={() => toggleTaskAction(task.id, 'delegate')} aria-pressed={task.action === 'delegate'} className={cn("text-[11px] font-black uppercase tracking-widest px-2 py-1 rounded transition-all w-20 text-center", task.action === 'delegate' ? "bg-warning text-warning-foreground shadow-md shadow-warning/20" : "text-[#9a3412] dark:text-warning hover:bg-warning/10")}>Delegate</button>
                         <button onClick={() => toggleTaskAction(task.id, 'defer')} aria-pressed={task.action === 'defer'} className={cn("text-[11px] font-black uppercase tracking-widest px-2 py-1 rounded transition-all w-20 text-center", task.action === 'defer' ? "bg-destructive text-destructive-foreground shadow-md shadow-destructive/20" : "text-destructive dark:text-[#f87171] hover:bg-destructive/10")}>Defer</button>
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
                   <p className="text-text-muted font-medium">Nothing added yet — your energy budget is at baseline.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-10">
          <div className="card p-6 border border-warning/20 bg-warning/5">
            <h4 className="text-sm font-medium uppercase tracking-widest text-warning mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Tracking Active
            </h4>
            <p className="text-text-main font-medium text-xs leading-relaxed">
              Integrations connected via <strong>Nova Overload Shield</strong> automatically factor in your calendar and message load here,
              so if things spike, your budget adjusts to reflect it.
            </p>
          </div>

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
                    value={newTaskName}
                    onChange={e => setNewTaskName(e.target.value)}
                    placeholder="Enter activity..."
                    className="w-full bg-surface/40 border border-border shadow-inner rounded-[2rem] px-8 py-5 text-lg font-display font-bold focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-text-main placeholder:"
                  />
                </div>

                <div className="space-y-4">
                  <p className="text-xs uppercase font-black tracking-widest text-text-muted ">Overview</p>
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
                        {type}
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
                  <p className="text-[11px] text-text-muted  px-1 font-semibold italic">● Indicates your active Recovery phase pillar. Matching it awards bonus points.</p>
                </div>

                <div className="space-y-6 pt-4">
                  <div className="flex justify-between items-end px-2">
                    <p className="text-xs uppercase font-black tracking-widest text-text-muted ">Capacitance Cost</p>
                    <p className="font-display font-black text-2xl text-primary">{newCost} <span className="text-xs font-black">CR</span></p>
                  </div>
                  <input 
                    type="range" 
                    min="5" 
                    max="50" 
                    step="5"
                    value={newCost}
                    onChange={e => setNewCost(parseInt(e.target.value))}
                    aria-label="Capacitance cost"
                    aria-valuetext={`${newCost} credits`}
                    className="w-full h-1.5 bg-surface/50 rounded-full appearance-none cursor-pointer accent-primary border border-border"
                  />
                </div>

                <div className="space-y-4 pt-6">
                  <button
                    onClick={addTask}
                    disabled={!newTaskName}
                    className="w-full btn-primary py-5 rounded-xl disabled:opacity-40 uppercase tracking-[0.2em] font-medium text-[11px] flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    Add Task <Plus className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleCommit}
                    disabled={isOverBudget || hasCommitted}
                    className={cn(
                      "w-full py-5 rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] transition-all border",
                      hasCommitted
                        ? "bg-teal-500/10 text-teal-500 border-teal-500/20"
                        : "bg-surface/40 text-text-muted border-border hover:bg-white dark:hover:bg-surface disabled:opacity-30"
                    )}
                  >
                    {hasCommitted ? "Budget Locked In" : "Lock In Today's Budget"}
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
                    This removes it from your energy budget for good. Are you sure?
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

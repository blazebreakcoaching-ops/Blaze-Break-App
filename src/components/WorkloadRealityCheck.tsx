import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useFocusTrap } from '../lib/useFocusTrap';
import {
  Target, 
  Clock, 
  ArrowRight, 
  ShieldAlert, 
  ListTodo, 
  Trash2, 
  Brain, 
  Plus, 
  Calendar, 
  ArrowUpDown, 
  AlertTriangle,
  Sparkles,
  Info,
  Edit2,
  X,
  Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface WorkloadRealityCheckProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type QuestionId = 'must' | 'wait' | 'delegate' | 'pretend' | 'future';

export interface WorkloadTask {
  id: string;
  title: string;
  category: 'must' | 'wait' | 'delegate' | 'future';
  energyDrain: number; // 1 to 100
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  completed: boolean;
}

const QUESTIONS: Record<QuestionId, { label: string; placeholder: string; icon: any }> = {
  must: { label: 'What MUST happen today?', placeholder: 'The non-negotiables...', icon: Target },
  wait: { label: 'What can wait?', placeholder: 'Things pulling at you that aren\'t actually due...', icon: Clock },
  delegate: { label: 'What can be delegated?', placeholder: 'Who else can handle this?', icon: ListTodo },
  pretend: { label: 'What are you PRETENDING is urgent?', placeholder: 'Be honest. Is it just loud?', icon: ShieldAlert },
  future: { label: 'What would Future You thank you for removing?', placeholder: 'What is just noise?', icon: Brain }
};

export const WorkloadRealityCheck = ({ fingerprint, onAwardPoints }: WorkloadRealityCheckProps) => {
  const [answers, setAnswers] = useState<Record<QuestionId, string>>({ must: '', wait: '', delegate: '', pretend: '', future: '' });
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [result, setResult] = useState<boolean>(false);

  // Task list states
  const [tasks, setTasks] = useState<WorkloadTask[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Sorting & Filtering state
  const [sortBy, setSortBy] = useState<'drain' | 'priority' | 'date'>('priority');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [dueDateFilter, setDueDateFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');

  // Input fields for new tasks
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<'must' | 'wait' | 'delegate' | 'future'>('must');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newDrain, setNewDrain] = useState(50);
  const [newDueDate, setNewDueDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  // Deletion confirmation state
  const [taskToDelete, setTaskToDelete] = useState<WorkloadTask | null>(null);
  const deleteDialogRef = useFocusTrap(!!taskToDelete);

  useEffect(() => {
    if (!taskToDelete) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setTaskToDelete(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [taskToDelete]);

  // Quick Edit states
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDrain, setEditingDrain] = useState(50);

  const handleStartEdit = (task: WorkloadTask) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
    setEditingDrain(task.energyDrain);
  };

  const handleSaveEdit = (id: string) => {
    if (!editingTitle.trim()) return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, title: editingTitle.trim(), energyDrain: editingDrain } : t));
    setEditingTaskId(null);
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
  };

  // Fatigue Probability Calculation
  const weeklyDrain = tasks
    .filter(t => !t.completed)
    .reduce((acc, t) => acc + t.energyDrain, 0);
  // Assuming a baseline capacity of ~300 drain points per week
  const fatigueProbability = Math.min(Math.round((weeklyDrain / 300) * 100), 100);
  const showFatigueWarning = fatigueProbability > 85;

  // Load real state from Firestore on mount - previously this was
  // localStorage only, so a workload reality check done on one device was
  // invisible everywhere else.
  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setDataLoaded(true); return; }
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'workload_reality_check', 'state'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.answers) setAnswers(data.answers);
          if (typeof data.completed === 'boolean') setResult(data.completed);
          if (Array.isArray(data.tasks)) setTasks(data.tasks);
        }
      } catch (e) {
        // Leaves the honest empty state in place rather than pretending progress loaded.
      }
      setDataLoaded(true);
    };
    load();
  }, []);

  const saveWorkloadState = (updates: Record<string, any>) => {
    if (!auth.currentUser) return;
    setDoc(doc(db, 'users', auth.currentUser.uid, 'workload_reality_check', 'state'), {
      ...updates,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {
      // Non-fatal - the UI still reflects the change locally even if this save fails.
    });
  };

  useEffect(() => {
    if (!dataLoaded) return; // Don't overwrite real data with defaults during initial load.
    saveWorkloadState({ answers });
  }, [answers, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    saveWorkloadState({ tasks });
  }, [tasks, dataLoaded]);

  const questionKeys = Object.keys(QUESTIONS) as QuestionId[];
  const activeQuestion = questionKeys[currentStep];

  const handleNext = () => {
    if (currentStep < questionKeys.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    setIsSynthesizing(true);

    setTimeout(() => {
      setIsSynthesizing(false);
      setResult(true);
      saveWorkloadState({ completed: true });

      // Sync onboarding answers to tasks if tasks is empty
      if (tasks.length === 0) {
        const seeded: WorkloadTask[] = [
          {
            id: 'must-' + Date.now(),
            title: answers.must || 'Perform essential project calibration block',
            category: 'must',
            energyDrain: 85,
            priority: 'high',
            dueDate: new Date().toISOString().split('T')[0],
            completed: false
          },
          {
            id: 'wait-' + Date.now(),
            title: answers.wait || 'Optimize secondary style guidelines',
            category: 'wait',
            energyDrain: 30,
            priority: 'low',
            dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
            completed: false
          },
          {
            id: 'delegate-' + Date.now(),
            title: answers.delegate || 'Update teammate dashboard configuration',
            category: 'delegate',
            energyDrain: 50,
            priority: 'medium',
            dueDate: new Date().toISOString().split('T')[0],
            completed: false
          },
          {
            id: 'future-' + Date.now(),
            title: answers.future || 'Redundant alerts cleanup',
            category: 'future',
            energyDrain: 15,
            priority: 'low',
            dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
            completed: true
          }
        ];
        setTasks(seeded);
      }

      if (onAwardPoints) onAwardPoints(15, 'Completed Workload Reality Check');
    }, 2000);
  };

  const handleReset = () => {
    const cleared = { must: '', wait: '', delegate: '', pretend: '', future: '' };
    setAnswers(cleared);
    setTasks([]);
    setCurrentStep(0);
    setResult(false);
    saveWorkloadState({ answers: cleared, tasks: [], completed: false });
  };

  // Add Task Function
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const added: WorkloadTask = {
      id: 'task-' + Date.now(),
      title: newTitle.trim(),
      category: newCategory,
      energyDrain: newDrain,
      priority: newPriority,
      dueDate: newDueDate,
      completed: false
    };

    setTasks(prev => [added, ...prev]);
    setNewTitle('');
    setNewDrain(50);
    
    if (onAwardPoints) {
      onAwardPoints(5, `Added Task: ${added.title}`);
    }
  };

  // Toggle compilation state
  const handleToggleTask = (id: string, e: React.MouseEvent) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === id);
      if (task && !task.completed) {
        // Trigger confetti exactly where the user clicked
        confetti({
          particleCount: 80,
          spread: 50,
          origin: {
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight
          },
          colors: ['#6366f1', '#10b981', '#f59e0b']
        });
      }
      return prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    });
  };

  // Safe delete handler
  const confirmDeleteTask = () => {
    if (!taskToDelete) return;
    setTasks(prev => prev.filter(t => t.id !== taskToDelete.id));
    setTaskToDelete(null);
  };

  // Energic range calculations
  const getDrainColor = (drain: number) => {
    if (drain < 35) return 'bg-success';
    if (drain < 70) return 'bg-warning';
    return 'bg-destructive';
  };

  const getDrainTextColor = (drain: number) => {
    if (drain < 35) return 'text-success dark:text-[#4ade80]';
    if (drain < 70) return 'text-[#9a3412] dark:text-warning';
    return 'text-destructive dark:text-[#f87171]';
  };

  const getPriorityBadgeClass = (priority: 'high' | 'medium' | 'low') => {
    if (priority === 'high') return 'bg-destructive/10 text-destructive dark:text-[#f87171] border-destructive/20';
    if (priority === 'medium') return 'bg-warning/10 text-[#9a3412] dark:text-warning border-warning/20';
    return 'bg-success/10 text-success dark:text-[#4ade80] border-success/20';
  };

  const getCategoryTheme = (category: 'must' | 'wait' | 'delegate' | 'future') => {
    switch (category) {
      case 'must':
        return { label: 'Must Do Today', badge: 'bg-success/10 text-success dark:text-[#4ade80] border-success/20' };
      case 'wait':
        return { label: 'Can Wait', badge: 'bg-primary/10 text-[#9a3412] dark:text-primary border-primary/20' };
      case 'delegate':
        return { label: 'Delegate / Defer', badge: 'bg-warning/10 text-[#9a3412] dark:text-warning border-warning/20' };
      case 'future':
        return { label: 'Future Guarded', badge: 'bg-primary/10 text-[#9a3412] dark:text-primary border-primary/20' };
    }
  };

  // Sorted list preparation
  const filteredTasks = tasks.filter(task => {
    if (statusFilter === 'pending' && task.completed) return false;
    if (statusFilter === 'completed' && !task.completed) return false;

    if (dueDateFilter !== 'all' && task.dueDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (dueDateFilter === 'today' && task.dueDate !== todayStr) return false;
      if (dueDateFilter === 'overdue' && task.dueDate >= todayStr) return false;
      if (dueDateFilter === 'upcoming' && task.dueDate <= todayStr) return false;
    }
    
    return true;
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // 1. Move completed to bottom
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    // 2. Automatically prioritize 'high' tasks
    if (a.priority !== b.priority) {
      if (a.priority === 'high') return -1;
      if (b.priority === 'high') return 1;
    }

    // 3. Fallback to user's selected sort logic
    if (sortBy === 'drain') {
      return b.energyDrain - a.energyDrain;
    }
    if (sortBy === 'priority') {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    }
    if (sortBy === 'date') {
      const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return dateA - dateB;
    }
    return 0;
  });

  return (
    <div className="space-y-12 pb-24 relative">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="tag">Section 16 / Workload Calibration</div>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Workload Reality Check</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Before you plan your day, strip away the noise. What is actually real?"
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!result && !isSynthesizing && (
          <motion.div
            key="questions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="card p-8 md:p-12 relative overflow-hidden border border-border"
          >
            <div className="flex items-center justify-between mb-8 overflow-hidden">
              <div className="flex gap-2">
                {questionKeys.map((k, i) => (
                  <div 
                    key={k} 
                    className={cn(
                      "h-2 rounded-full transition-all duration-500",
                      i === currentStep ? "w-12 bg-primary" : i < currentStep ? "w-6 bg-primary/30" : "w-6 bg-border"
                    )} 
                  />
                ))}
              </div>
              <span role="status" aria-live="polite" className="text-sm font-black uppercase tracking-widest text-text-muted">
                Step {currentStep + 1} of {questionKeys.length}
              </span>
            </div>

            <div className="space-y-8">
              <div className="flex items-center gap-4 mb-2">
                {(() => {
                  const Icon = QUESTIONS[activeQuestion].icon;
                  return (
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <Icon className="w-6 h-6" />
                    </div>
                  );
                })()}
                <h3 id="workload-question-heading" className="text-2xl md:text-3xl font-display font-bold text-text-main">
                  {QUESTIONS[activeQuestion].label}
                </h3>
              </div>
              
              <textarea
                autoFocus
                key={activeQuestion}
                value={answers[activeQuestion]}
                onChange={(e) => setAnswers({ ...answers, [activeQuestion]: e.target.value })}
                placeholder={QUESTIONS[activeQuestion].placeholder}
                aria-labelledby="workload-question-heading"
                className="w-full h-40 bg-surface dark:bg-surface/50 border border-border/50 rounded-2xl p-6 focus:outline-none focus:border-primary resize-none text-xl text-text-main placeholder-text-muted/60 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) {
                    handleNext();
                  }
                }}
              />

              <div className="flex justify-between items-center pt-6 text-sm text-text-muted">
                <span>Press <kbd className="font-mono bg-border px-1.5 py-0.5 rounded text-xs">Cmd</kbd> + <kbd className="font-mono bg-border px-1.5 py-0.5 rounded text-xs">Enter</kbd> to advance</span>
                <button 
                  onClick={handleNext} 
                  disabled={!answers[activeQuestion].trim()}
                  className="btn-primary"
                >
                  {currentStep === questionKeys.length - 1 ? "Build My Plan" : "Next Question"} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {isSynthesizing && (
          <motion.div
            key="synthesizing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="card p-6 sm:p-8 md:p-12 flex flex-col items-center justify-center text-center min-h-[400px] border border-border"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
              className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full mb-8 shrink-0"
            />
            <h3 className="text-2xl font-display font-bold text-text-main mb-2">Stripping the Noise...</h3>
            <p className="text-text-muted font-medium max-w-md">Nova is categorizing your inputs to protect your energy baseline.</p>
          </motion.div>
        )}

        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Real Coach Warning Prompt */}
            <div className="card border border-primary/20 bg-primary/5 p-6 relative overflow-hidden">
              <div className="relative z-10 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-display font-bold text-text-main tracking-tight">Nova's Take</h3>
                    <p className="text-[11px] uppercase tracking-[0.2em] font-black text-[#9a3412] dark:text-primary">Cutting Through the Urgency</p>
                  </div>
                </div>
                <p className="text-sm text-text-main font-serif italic leading-relaxed">
                  "A lot of what's on here reads as urgent because of anxiety, not because it actually has to happen today. Let's separate what's real from what's just loud, and drop what's actually draining you for no reason."
                </p>
              </div>
            </div>

            {/* Interactive New Task Injector Form */}
            {showFatigueWarning && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-4 mb-6 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-destructive/20 text-destructive flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-destructive dark:text-[#f87171]">Critical: Fatigue Probability is {fatigueProbability}%</h4>
                  <p className="text-xs text-destructive/80 dark:text-[#f87171] mt-1 leading-relaxed">
                    You are severely over-scheduled. The accumulated cognitive load of this pending task list exceeds your baseline recovery velocity. You must delegate or delete tasks before the week begins to avoid a systemic crash.
                  </p>
                </div>
              </motion.div>
            )}
            <div className="bg-surface dark:bg-card/60 p-6 md:p-8 rounded-xl border border-border space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#9a3412] dark:text-primary">Task Calibration</h4>
                  <p className="text-[11px] text-text-muted mt-0.5">Define a task with its specific energetic toll, prioritization node, and deadline.</p>
                </div>
              </div>

              <form onSubmit={handleAddTask} className="grid grid-cols-1 md:grid-cols-6 gap-5 items-end">
                {/* Title */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[11px] uppercase font-black tracking-widest text-text-muted block">Task Title / Actionable Goal</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Finish strategic proposal review"
                    className="w-full bg-white dark:bg-surface border border-border/40 rounded-xl px-4 py-2.5 text-xs text-text-main focus:outline-none focus:border-primary transition-all font-sans"
                  />
                </div>

                {/* Category */}
                <div className="space-y-2 font-sans">
                  <label className="text-[11px] uppercase font-black tracking-widest text-text-muted block">Calibration Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full bg-white dark:bg-surface border border-border/40 rounded-xl px-3 py-2.5 text-xs text-text-main focus:outline-none focus:border-primary transition-all cursor-pointer"
                  >
                    <option value="must">🔴 Must Do Today</option>
                    <option value="wait">🔵 Can Wait</option>
                    <option value="delegate">🟡 Delegate / Defer</option>
                    <option value="future">🟣 Future Guarded</option>
                  </select>
                </div>

                {/* Priority Selection Field */}
                <div className="space-y-2 font-sans">
                  <label className="text-[11px] uppercase font-black tracking-widest text-text-muted block">Priority Level</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-white dark:bg-surface border border-border/40 rounded-xl px-3 py-2.5 text-xs text-text-main focus:outline-none focus:border-primary transition-all cursor-pointer"
                  >
                    <option value="high">🔴 High Priority</option>
                    <option value="medium">🟡 Medium Priority</option>
                    <option value="low">🟢 Low Priority</option>
                  </select>
                </div>

                {/* Due Date */}
                <div className="space-y-2 font-sans">
                  <label className="text-[11px] uppercase font-black tracking-widest text-text-muted block">Due Date Anchor</label>
                  <input
                    type="date"
                    required
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full bg-white dark:bg-surface border border-border/40 rounded-xl px-4 py-2 text-xs text-text-main focus:outline-none focus:border-primary transition-all"
                  />
                </div>

                {/* Click Submission */}
                <div className="font-sans">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-primary hover:bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shrink-0 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Calibrate Task
                  </button>
                </div>

                {/* Energy Drain Percentage Slider - Spans across bottom grid rows */}
                <div className="md:col-span-6 bg-white/40 dark:bg-card/30 p-4 rounded-2xl border border-border/10 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  <div className="space-y-0.5">
                    <span className="text-xs text-text-main font-bold block">Assigned Physical Energy Drain:</span>
                    <p className="text-[11px] text-text-muted leading-relaxed">Quantify cognitive drag ($0-$100) on your baseline.</p>
                  </div>
                  <div className="md:col-span-2">
                    <input
                      type="range"
                      min="5"
                      max="100"
                      step="5"
                      value={newDrain}
                      onChange={(e) => setNewDrain(parseInt(e.target.value, 10))}
                      aria-label="Assigned physical energy drain percentage"
                      aria-valuetext={`${newDrain} percent, ${newDrain < 35 ? 'Low Drain' : newDrain < 70 ? 'Moderate Drain' : 'Heavy Crash Trigger'}`}
                      className="w-full accent-primary h-1.5 rounded-full cursor-pointer bg-border dark:bg-surface"
                    />
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <span className={cn("text-sm font-mono font-black", getDrainTextColor(newDrain))}>
                      {newDrain}%
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                      ({newDrain < 35 ? 'Low Drain' : newDrain < 70 ? 'Moderate Drain' : 'Heavy Crash Trigger'})
                    </span>
                  </div>
                </div>
              </form>
            </div>

            {/* Sorting & Filtering Toolbar Dashboard */}
            <div className="bg-surface dark:bg-surface border border-border/30 rounded-2xl p-4 flex flex-col gap-4 font-sans mb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-text-main">
                    Calibrated Task Inventory: {filteredTasks.length} pending / {tasks.length} total
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-xs uppercase font-black tracking-widest text-text-muted flex items-center gap-1 shrink-0">
                    <ArrowUpDown className="w-3 h-3" /> Sort By:
                  </span>
                  <div className="flex gap-1 bg-surface/20 border border-border/20 rounded-lg p-0.5">
                    {[
                      { key: 'priority', label: 'Priority' },
                      { key: 'drain', label: 'Drain' },
                      { key: 'date', label: 'Date' }
                    ].map(option => (
                      <button
                        key={option.key}
                        onClick={() => setSortBy(option.key as any)}
                        aria-pressed={sortBy === option.key}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                          sortBy === option.key 
                            ? "bg-white dark:bg-surface text-[#9a3412] dark:text-primary shadow-sm border border-border/20" 
                            : "bg-transparent text-text-muted hover:text-text-main"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Filtering Controls */}
              <div className="pt-3 border-t border-border/10 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-black tracking-widest text-text-muted">Status:</span>
                  <div className="flex gap-1 bg-surface/20 border border-border/20 rounded-lg p-0.5">
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'pending', label: 'Pending' },
                      { key: 'completed', label: 'Completed' }
                    ].map(option => (
                      <button
                        key={option.key}
                        onClick={() => setStatusFilter(option.key as any)}
                        aria-pressed={statusFilter === option.key}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                          statusFilter === option.key 
                            ? "bg-white dark:bg-surface text-[#9a3412] dark:text-primary shadow-sm border border-border/20" 
                            : "bg-transparent text-text-muted hover:text-text-main"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-black tracking-widest text-text-muted">Timing:</span>
                  <div className="flex gap-1 bg-surface/20 border border-border/20 rounded-lg p-0.5">
                    {[
                      { key: 'all', label: 'All Dates' },
                      { key: 'overdue', label: 'Overdue' },
                      { key: 'today', label: 'Today' },
                      { key: 'upcoming', label: 'Upcoming' }
                    ].map(option => (
                      <button
                        key={option.key}
                        onClick={() => setDueDateFilter(option.key as any)}
                        aria-pressed={dueDateFilter === option.key}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                          dueDateFilter === option.key 
                            ? "bg-white dark:bg-surface text-[#9a3412] dark:text-primary shadow-sm border border-border/20" 
                            : "bg-transparent text-text-muted hover:text-text-main"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Task Checklist Items Listing */}
            {sortedTasks.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl font-sans">
                <ListTodo className="w-8 h-8 text-text-muted mx-auto opacity-45 mb-2" />
                <p className="text-sm text-text-main font-bold">No calibrated tasks remaining.</p>
                <p className="text-xs text-text-muted mt-1">Add tasks above to begin mapping your physical energy budget.</p>
              </div>
            ) : (
              <div className="space-y-8 font-sans">
                {(['must', 'wait', 'delegate', 'future'] as const).map(categoryKey => {
                  const categoryTasks = sortedTasks.filter(t => t.category === categoryKey);
                  if (categoryTasks.length === 0) return null;
                  
                  const catTheme = getCategoryTheme(categoryKey);
                  
                  return (
                    <div key={categoryKey} className="space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-text-muted border-b border-border/40 pb-2 flex items-center gap-2">
                        <span className={cn("inline-block w-2 h-2 rounded-full", catTheme?.badge.split(' ')[0])} />
                        {catTheme?.label}
                      </h4>
                      <div className="space-y-3">
                        <AnimatePresence initial={false}>
                          {categoryTasks.map((task) => {
                            const catInfo = getCategoryTheme(task.category);
                            return (
                              <motion.div
                                key={task.id}
                                layout
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ 
                                  opacity: task.completed ? 0.6 : 1, 
                                  x: 0, 
                                  scale: task.completed ? 0.98 : 1,
                                }}
                                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                className={cn(
                                  "p-4 md:p-5 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 backdrop-blur-md shadow-sm relative group transition-colors",
                                  task.completed 
                                    ? "bg-surface/50 dark:bg-card/40 border-border/20" 
                                    : "bg-white dark:bg-card border-border/40 hover:border-primary/30"
                                )}
                              >
                                <div className="flex items-start gap-3.5 shrink-0">
                                  {/* Checkbox trigger */}
                                  <button
                                    onClick={(e) => handleToggleTask(task.id, e)}
                                    role="checkbox"
                                    aria-checked={task.completed}
                                    aria-label={`Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`}
                                    className="mt-0.5 w-5 h-5 rounded-md border border-border/50 flex items-center justify-center shrink-0 transition-all hover:border-primary cursor-pointer"
                                  >
                                    {task.completed && (
                                      <div className="w-3 h-3 rounded-sm bg-primary" />
                                    )}
                                  </button>

                          <div className="space-y-1">
                            {/* Task category tags */}
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shrink-0", catInfo?.badge)}>
                                {catInfo?.label}
                              </span>
                              <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shrink-0", getPriorityBadgeClass(task.priority))}>
                                {task.priority} Priority
                              </span>
                              {task.dueDate && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono border border-border/20 text-text-muted uppercase shrink-0 flex items-center gap-1 bg-surface/20">
                                  <Calendar className="w-2.5 h-2.5" /> {task.dueDate}
                                </span>
                              )}
                            </div>

                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                className="text-sm font-bold block w-full bg-surface dark:bg-card border border-border/50 rounded-xl px-2.5 py-1 focus:outline-none focus:border-primary text-text-main mt-1 font-sans"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit(task.id);
                                  if (e.key === 'Escape') handleCancelEdit();
                                }}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                              />
                            ) : (
                              <span className={cn(
                                "text-sm font-bold block leading-snug text-text-main transition-all mt-1",
                                task.completed && "line-through text-text-muted"
                              )}>
                                {task.title}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Energy Drain visualizer as progress bar/slider within the item itself, from green to red scale */}
                        <div className="w-full md:w-56 space-y-1.5 shrink-0 self-stretch flex flex-col justify-center">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-text-muted uppercase tracking-widest flex items-center gap-1">
                              {editingTaskId === task.id ? "Adjust Energy Drag" : "Energy Drag"}
                            </span>
                            <span className={cn("font-mono font-black", getDrainTextColor(editingTaskId === task.id ? editingDrain : task.energyDrain))}>
                              {editingTaskId === task.id ? editingDrain : task.energyDrain}%
                            </span>
                          </div>
                          
                          {editingTaskId === task.id ? (
                            <input
                              type="range"
                              min="5"
                              max="100"
                              step="5"
                              value={editingDrain}
                              onChange={(e) => setEditingDrain(parseInt(e.target.value, 10))}
                              aria-label="Edit energy drain percentage"
                              aria-valuetext={`${editingDrain} percent, ${editingDrain < 35 ? 'Low Drain' : editingDrain < 70 ? 'Moderate Drain' : 'Heavy Crash Trigger'}`}
                              className="w-full h-1.5 rounded-full cursor-pointer bg-border dark:bg-surface/80 accent-primary"
                            />
                          ) : (
                            /* Colored scale progress bar */
                            <div className="w-full h-1.5 bg-surface dark:bg-surface/80 rounded-full overflow-hidden">
                              <div 
                                className={cn("h-full rounded-full transition-all duration-700", getDrainColor(task.energyDrain))}
                                style={{ width: `${task.energyDrain}%` }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Action buttons (Edit/Save/Cancel/Delete) */}
                        <div className="flex items-center gap-2 self-end md:self-center">
                          {editingTaskId === task.id ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(task.id)}
                                aria-label="Save calibration"
                                className="p-2 border border-success/30 rounded-xl text-success dark:text-[#4ade80] hover:text-white hover:bg-success transition-all cursor-pointer shadow-sm"
                                title="Save calibration"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                aria-label="Cancel edit"
                                className="p-2 border border-border/20 rounded-xl text-text-muted hover:text-text-main hover:bg-surface/25 transition-all cursor-pointer shadow-sm"
                                title="Cancel edit"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartEdit(task)}
                                aria-label={`Edit ${task.title}`}
                                className="p-2 border border-border/20 rounded-xl text-text-muted hover:text-[#9a3412] dark:hover:text-primary hover:bg-primary/5 hover:border-primary/15 transition-all cursor-pointer shadow-sm"
                                title="Quick calibration"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setTaskToDelete(task)}
                                aria-label={`Delete ${task.title}`}
                                className="p-2 border border-border/20 rounded-xl text-text-muted hover:text-destructive dark:hover:text-[#f87171] hover:bg-destructive/5 hover:border-destructive/15 transition-all cursor-pointer shadow-sm"
                                title="Calibrate and delete task"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Clear Next Step action instruction block */}
            <div className="bg-gradient-to-r from-primary/5 via-primary/5 to-surface/20 border border-border/40 p-6 rounded-2xl space-y-4">
              <span className="text-xs font-black uppercase tracking-widest text-[#9a3412] dark:text-primary flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 animate-bounce" /> Your Prescribed Recovery Action Plan Step
              </span>
              <p className="text-xs text-text-muted leading-relaxed">
                Review your task inventory prioritized by energetic drain. To prevent burnout, commit to completing your <strong>Must Do Today</strong> lists early, then completely power down during the <strong>Mandatory Recovery Block</strong>.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => {
                    const mustTasks = tasks.map(t => t.category === 'must' ? { ...t, completed: true } : t);
                    setTasks(mustTasks);
                    if (onAwardPoints) {
                      onAwardPoints(10, 'Completed all essential high-priority tasks');
                    }
                  }}
                  className="px-4 py-2 bg-primary hover:bg-primary text-primary-foreground font-bold text-[11px] uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Mark All "Must Do" Complete (+10 pts)
                </button>
                <button onClick={handleReset} className="px-4 py-2 border border-border/20 text-text-muted hover:text-text-main font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-surface/35 transition-all cursor-pointer">
                  Recalibrate Workload
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog Dialog / Modal to Prevent Accidental Data Loss */}
      <AnimatePresence>
        {taskToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop backing */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTaskToDelete(null)}
              className="absolute inset-0 bg-surface/60 backdrop-blur-md"
            />

            {/* Modal card layout */}
            <motion.div
              ref={deleteDialogRef as any}
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-task-title"
              tabIndex={-1}
              className="bg-white dark:bg-surface border border-border/40 rounded-xl p-6 md:p-8 max-w-md w-full relative z-[110] shadow-lg font-sans"
            >
              <div className="flex gap-4 items-start mb-5">
                <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 id="delete-task-title" className="text-base font-bold text-text-main">
                    Confirm Task Deletion
                  </h4>
                  <p className="text-xs text-text-muted leading-relaxed">
                    You are discarding a calibrated workspace task. Doing so will permanently wipe out its recorded energy budget projection.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-surface dark:bg-card border border-border/20 rounded-2xl text-xs mb-6 space-y-1">
                <span className="font-bold text-text-muted uppercase tracking-widest text-[11px] block">Attempting to Discard:</span>
                <p className="font-bold text-text-main">{taskToDelete.title}</p>
                <span className={cn("text-xs uppercase tracking-wider block font-bold", getDrainTextColor(taskToDelete.energyDrain))}>
                  Energy Drain Drag: {taskToDelete.energyDrain}%
                </span>
              </div>

              <div className="flex items-center justify-end gap-3.5">
                <button
                  onClick={() => setTaskToDelete(null)}
                  className="px-4 py-2 border border-border/20 text-text-muted hover:text-text-main font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-surface/30 transition-all cursor-pointer"
                >
                  Cancel Safeguard
                </button>
                <button
                  onClick={confirmDeleteTask}
                  className="px-4 py-2 bg-destructive hover:bg-destructive text-destructive-foreground font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Delete Task
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

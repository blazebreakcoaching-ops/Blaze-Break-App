import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  MapPin, 
  BatteryFull, 
  Sparkles, 
  Award, 
  CheckCircle2, 
  Lock, 
  Unlock, 
  TrendingUp, 
  BookOpen, 
  MessageSquare, 
  Heart, 
  Users, 
  ChevronRight, 
  UserCheck, 
  User, 
  Send,
  Zap,
  Moon,
  Volume2,
  Check,
  AlertTriangle
} from 'lucide-react';
import { BurnoutFingerprint, UserStats, BADGES, Debt } from '../types';
import { cn } from '../lib/utils';

interface RecoveryPlanProps {
  stats: UserStats;
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints: (amount: number, reason: string) => void;
  onNavigateTab: (tab: any) => void;
  onRehearsalComplete?: () => void;
}

interface ActionItem {
  id: string;
  section: 'Recover' | 'Communicate' | 'Reflect';
  text: string;
  points: number;
  completed: boolean;
  tag: string;
}

export const RecoveryPlan = ({ 
  stats, 
  fingerprint, 
  onAwardPoints, 
  onNavigateTab,
  onRehearsalComplete
}: RecoveryPlanProps) => {

  // Load opt-in and nickname settings from localStorage
  const [optInLeaderboard, setOptInLeaderboard] = useState(() => {
    return localStorage.getItem('blaze_leaderboard_opt_in') === 'true';
  });
  const [nickname, setNickname] = useState(() => {
    return localStorage.getItem('blaze_leaderboard_nickname') || 'AnonymousPractitioner';
  });
  const [isEditingNickname, setIsEditingNickname] = useState(false);

  // Journal Reflections
  const [journalText, setJournalText] = useState('');
  const [submittedJournals, setSubmittedJournals] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('blaze_submitted_journals');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Rehearsal Practice Input
  const [rehearsalText, setRehearsalText] = useState('');
  const [rehearsalStep, setRehearsalStep] = useState(0); // 0: Idle, 1: Active, 2: Finished

  // Recovery Plan Action Items
  const [actions, setActions] = useState<ActionItem[]>([]);

  // 1. Determine highest physiological debt
  const getHighestDebt = (): any => {
    const debts = stats.debts || [];
    if (debts.length === 0) return { label: 'Neural Fatigue', value: 8, max: 20, unit: 'cr' };
    return [...debts].sort((a, b) => (b.value / b.max) - (a.value / a.max))[0];
  };

  const highestDebt = getHighestDebt();
  const highestDebtRatio = highestDebt.value / highestDebt.max;

  // 2. Synthesize dynamic coaching feedback from Nova
  const getNovaSynthesis = () => {
    const archetype = fingerprint?.profile || 'High-Functioning Exhausted';
    
    let feedback = '';
    if (archetype === 'Founder on Fire') {
      feedback = "Your identity is completely fused with the survival of your venture. Right now, your " + highestDebt.label + " is at " + Math.round(highestDebtRatio * 100) + "%. This is not an operational metric to optimize; it is a biological warning. Cease the fawning performance narratives and rest.";
    } else if (archetype === 'Over-Giver') {
      feedback = "Your fawning habit has turned you into a safety net for everyone else's obligations. Your current " + highestDebt.label + " (" + Math.round(highestDebtRatio * 100) + "% load) is a physical proof of fawning. You are leaking energy by keeping others comfortable. Let's patch it.";
    } else if (archetype === 'Silent Resenter') {
      feedback = "You are carrying intense resentment because you keep saying yes while your battery screams. Your " + highestDebt.label + " is at " + Math.round(highestDebtRatio * 100) + "% of total collapse. Resentment is your nervous system's way of showing where boundaries are needed.";
    } else if (archetype === 'Manager in the Middle') {
      feedback = "Squeezed between corporate targets and team fatigue, your neural buffers are depleted. Your " + highestDebt.label + " load is at " + Math.round(highestDebtRatio * 100) + "%. Today is about reclaiming your executive authority through radical, protective calendar scheduling.";
    } else if (archetype === 'The Impostor') {
      feedback = "You keep adding proof to a case that's already closed. Your " + highestDebt.label + " is at " + Math.round(highestDebtRatio * 100) + "%. The wins are real — today is about letting one of them actually count.";
    } else if (archetype === 'The Perfectionist') {
      feedback = "Your standards are the leak, not other people's demands. Your " + highestDebt.label + " is at " + Math.round(highestDebtRatio * 100) + "%. Today is about handing something off and leaving it alone.";
    } else if (archetype === 'The Constant Adapter') {
      feedback = "A lot of your energy is going into managing how you come across, not the work itself. Your " + highestDebt.label + " is at " + Math.round(highestDebtRatio * 100) + "%. Today is about protecting real recovery time, not just pushing through.";
    } else if (archetype === 'The Second Shift') {
      feedback = "You're running two jobs at once, and only one of them is visible to anyone else. Your " + highestDebt.label + " is at " + Math.round(highestDebtRatio * 100) + "%. Today is about naming the invisible load, not carrying it silently.";
    } else if (archetype === 'Crisis Sprinter') {
      feedback = "Your system runs on urgency, and calm feels riskier than pressure does. Your " + highestDebt.label + " is at " + Math.round(highestDebtRatio * 100) + "%. Today is about proving to your own nervous system that quiet is safe.";
    } else if (archetype === 'People-Pleasing Performer') {
      feedback = "The version of you that shows up for other people is working overtime. Your " + highestDebt.label + " is at " + Math.round(highestDebtRatio * 100) + "%. Today is about letting one honest reaction through.";
    } else if (archetype === 'Responsibility Addict') {
      feedback = "You've quietly taken ownership of things that were never yours to carry. Your " + highestDebt.label + " is at " + Math.round(highestDebtRatio * 100) + "%. Today is about leaving one thing where it actually belongs.";
    } else {
      feedback = "Perfectionism is a slow energy leak. Your " + highestDebt.label + " is currently loaded to " + Math.round(highestDebtRatio * 100) + "% capacity. Stop aiming for 120% where a calm, steady 85% is perfect. Let's practice active nervous system regulation.";
    }
    return feedback;
  };

  // Generate checklist on profile / highest debt change
  useEffect(() => {
    if (!fingerprint) return;

    const archetype = fingerprint.profile || 'High-Functioning Exhausted';
    const debtLabel = highestDebt.label;

    const savedCompletedActions = localStorage.getItem('blaze_completed_plan_actions');
    const completedIds: string[] = savedCompletedActions ? JSON.parse(savedCompletedActions) : [];

    const items: ActionItem[] = [];

    // section A: RECOVER (Tailored physiological rest based on highest debt)
    if (debtLabel === 'Sleep Debt') {
      items.push({
        id: 'rec_sleep_1',
        section: 'Recover',
        text: 'Try a 20-minute Non-Sleep Deep Rest (NSDR) somatic breathing loop',
        points: 50,
        completed: completedIds.includes('rec_sleep_1'),
        tag: 'Sleep Repair'
      });
      items.push({
        id: 'rec_sleep_2',
        section: 'Recover',
        text: 'Establish sleep anchor: Go fully screen-free 1 hour before bed',
        points: 50,
        completed: completedIds.includes('rec_sleep_2'),
        tag: 'Circadian Stabilization'
      });
    } else if (debtLabel === 'Neural Fatigue') {
      items.push({
        id: 'rec_neural_1',
        section: 'Recover',
        text: 'Sensory Deprivation Block: 30 minutes in a dark, quiet environment',
        points: 50,
        completed: completedIds.includes('rec_neural_1'),
        tag: 'Neural Recharge'
      });
      items.push({
        id: 'rec_neural_2',
        section: 'Recover',
        text: 'Setup 45-minute strict, single-task deep focus blocks today',
        points: 50,
        completed: completedIds.includes('rec_neural_2'),
        tag: 'Attention Shield'
      });
    } else {
      // Social Overlap or other
      items.push({
        id: 'rec_social_1',
        section: 'Recover',
        text: 'Notification Shield: Turn off all push notifications for 3 consecutive hours',
        points: 50,
        completed: completedIds.includes('rec_social_1'),
        tag: 'Stimuli Reduction'
      });
      items.push({
        id: 'rec_social_2',
        section: 'Recover',
        text: 'Decline or delegate at least one non-essential meeting on your calendar',
        points: 50,
        completed: completedIds.includes('rec_social_2'),
        tag: 'Calendar Defense'
      });
    }

    // section B: COMMUNICATE (Tailored scripts based on archetype)
    if (archetype === 'Founder on Fire') {
      items.push({
        id: 'comm_founder_1',
        section: 'Communicate',
        text: 'Script and rehearsing a professional timeline pushback for clients',
        points: 75,
        completed: completedIds.includes('comm_founder_1'),
        tag: 'Client Boundary'
      });
    } else if (archetype === 'Over-Giver') {
      items.push({
        id: 'comm_giver_1',
        section: 'Communicate',
        text: 'Rehearse saying "Hold my line" script to a colleague requesting help',
        points: 75,
        completed: completedIds.includes('comm_giver_1'),
        tag: 'Fawn De-escalation'
      });
    } else if (archetype === 'Silent Resenter') {
      items.push({
        id: 'comm_resenter_1',
        section: 'Communicate',
        text: 'Draft a direct, honest feedback response regarding a repetitive task bypass',
        points: 75,
        completed: completedIds.includes('comm_resenter_1'),
        tag: 'Radical Candor'
      });
    } else if (archetype === 'Manager in the Middle') {
      items.push({
        id: 'comm_manager_1',
        section: 'Communicate',
        text: 'Rehearse team capacity boundary script to high leadership',
        points: 75,
        completed: completedIds.includes('comm_manager_1'),
        tag: 'Buffer Shielding'
      });
    } else if (archetype === 'The Impostor') {
      items.push({
        id: 'comm_impostor_1',
        section: 'Communicate',
        text: 'Practice accepting praise for a win out loud, without qualifying or deflecting it',
        points: 75,
        completed: completedIds.includes('comm_impostor_1'),
        tag: 'Owning Wins'
      });
    } else if (archetype === 'The Perfectionist') {
      items.push({
        id: 'comm_perfectionist_1',
        section: 'Communicate',
        text: 'Rehearse handing off a task with "this meets what we needed" and no follow-up review',
        points: 75,
        completed: completedIds.includes('comm_perfectionist_1'),
        tag: 'Letting Go'
      });
    } else if (archetype === 'The Constant Adapter') {
      items.push({
        id: 'comm_adapter_1',
        section: 'Communicate',
        text: 'Practice directly requesting one specific accommodation (buffer time, written follow-up) without over-explaining',
        points: 75,
        completed: completedIds.includes('comm_adapter_1'),
        tag: 'Direct Ask'
      });
    } else if (archetype === 'The Second Shift') {
      items.push({
        id: 'comm_secondshift_1',
        section: 'Communicate',
        text: 'Rehearse naming your caregiving load to one person at work who can adjust expectations',
        points: 75,
        completed: completedIds.includes('comm_secondshift_1'),
        tag: 'Naming the Load'
      });
    } else if (archetype === 'Crisis Sprinter') {
      items.push({
        id: 'comm_crisissprinter_1',
        section: 'Communicate',
        text: 'Practice telling a colleague "this can wait until tomorrow" for something that genuinely can',
        points: 75,
        completed: completedIds.includes('comm_crisissprinter_1'),
        tag: 'De-escalating Urgency'
      });
    } else if (archetype === 'People-Pleasing Performer') {
      items.push({
        id: 'comm_ppperformer_1',
        section: 'Communicate',
        text: 'Practice giving an honest, unpolished answer to "how are you" instead of the automatic "fine"',
        points: 75,
        completed: completedIds.includes('comm_ppperformer_1'),
        tag: 'Dropping the Performance'
      });
    } else if (archetype === 'Responsibility Addict') {
      items.push({
        id: 'comm_respaddict_1',
        section: 'Communicate',
        text: 'Rehearse saying "that\'s not mine to fix" and leaving it there',
        points: 75,
        completed: completedIds.includes('comm_respaddict_1'),
        tag: 'Releasing Ownership'
      });
    } else {
      items.push({
        id: 'comm_exhaust_1',
        section: 'Communicate',
        text: 'Practice the "I am fully booked this cycle, we can prioritize this next week" script',
        points: 75,
        completed: completedIds.includes('comm_exhaust_1'),
        tag: 'Capacity Defense'
      });
    }

    // section C: REFLECT
    items.push({
      id: 'ref_global_1',
      section: 'Reflect',
      text: 'Identify and journal on today\'s primary fawning/people-pleasing moment',
      points: 50,
      completed: completedIds.includes('ref_global_1'),
      tag: 'Self-Awareness'
    });

    setActions(items);
  }, [fingerprint, stats.debts]);

  // Handle completion check toggling
  const handleToggleCheck = (id: string, pts: number) => {
    const updated = actions.map(act => {
      if (act.id === id) {
        const nextState = !act.completed;
        if (nextState) {
          onAwardPoints(pts, `Completed Recovery Action: ${act.text.substring(0, 30)}...`);
        }
        return { ...act, completed: nextState };
      }
      return act;
    });

    setActions(updated);
    const completedIds = updated.filter(a => a.completed).map(a => a.id);
    localStorage.setItem('blaze_completed_plan_actions', JSON.stringify(completedIds));
  };

  // Submit reflection journal
  const handleJournalSubmit = () => {
    if (journalText.trim().length < 10) return;
    
    const textToSave = journalText.trim();
    const newJournals = [
      `[${new Date().toLocaleDateString()}] ${textToSave}`,
      ...submittedJournals
    ];
    setSubmittedJournals(newJournals);
    localStorage.setItem('blaze_submitted_journals', JSON.stringify(newJournals));
    
    // Auto complete the reflection action if it exists
    const reflectAct = actions.find(a => a.section === 'Reflect');
    if (reflectAct && !reflectAct.completed) {
      handleToggleCheck(reflectAct.id, reflectAct.points);
    } else {
      onAwardPoints(50, "Wrote in Reflection Journal");
    }

    setJournalText('');
  };

  // Submit active boundary practice
  const handleBoundaryRehearsalSubmit = () => {
    if (rehearsalText.trim().length < 10) return;

    onAwardPoints(75, "Rehearsed & Committed to Boundary");
    if (onRehearsalComplete) onRehearsalComplete();

    // Auto complete the boundary action if it exists
    const commAct = actions.find(a => a.section === 'Communicate');
    if (commAct && !commAct.completed) {
      handleToggleCheck(commAct.id, commAct.points);
    }

    setRehearsalText('');
    setRehearsalStep(2); // Finish state
  };

  // Save nickname changes
  const saveNickname = () => {
    const trimmed = nickname.trim().replace(/\s+/g, '');
    if (trimmed.length > 2) {
      setNickname(trimmed);
      localStorage.setItem('blaze_leaderboard_nickname', trimmed);
    }
    setIsEditingNickname(false);
  };

  // Toggle leaderboard opt-in
  const handleToggleLeaderboard = (checked: boolean) => {
    setOptInLeaderboard(checked);
    localStorage.setItem('blaze_leaderboard_opt_in', String(checked));
  };

  // Dynamic Leaderboard Generation
  const getLeaderboardData = () => {
    const defaultPeers = [
      { name: 'SovereignPractitioner', level: 6, points: 2750, stage: 'Identity', isUser: false },
      { name: 'NervousRegulator_88', level: 5, points: 2150, stage: 'Habits', isUser: false },
      { name: 'ZenFounder', level: 4, points: 1850, stage: 'Identity', isUser: false },
      { name: 'CalmCeo_3', level: 3, points: 1450, stage: 'Safety', isUser: false },
      { name: 'BoundaryPractitioner', level: 2, points: 850, stage: 'Safety', isUser: false },
    ];

    const userEntry = {
      name: optInLeaderboard ? nickname : 'You (Anonymized)',
      level: Math.floor(stats.points / 500) + 1,
      points: stats.points,
      stage: stats.unlockedBadges.includes('boundary_set') ? 'Identity' : 'Safety',
      isUser: true
    };

    // Slot user in correctly sorted by points
    const fullList = [...defaultPeers, userEntry].sort((a, b) => b.points - a.points);
    return fullList;
  };

  const leaderboardEntries = getLeaderboardData();

  // LOCKED STATE RENDER
  if (!fingerprint) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="card text-center p-12 bg-card border-dashed border-border flex flex-col items-center justify-center space-y-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-destructive/5 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="w-20 h-20 bg-primary/10 text-primary border border-primary/20 rounded-3xl flex items-center justify-center shadow-lg relative">
            <Lock className="w-10 h-10 animate-pulse" />
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow">
              Locked
            </span>
          </div>

          <div className="space-y-4 max-w-lg">
            <h3 className="text-3xl font-display font-bold tracking-tight text-text-main">Recovery Plan Synthesis Locked</h3>
            <p className="text-sm text-text-muted leading-relaxed font-medium">
              Nova requires both your **Burnout Fingerprint Diagnostic** and your **Recovery Debt Tracker** to compile a personalized recovery plan.
            </p>
          </div>

          <div className="w-full max-w-md p-6 bg-surface dark:bg-surface/50 border border-border rounded-2xl space-y-4 text-left">
            <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Prerequisites</h4>
            
            <div className="flex items-center justify-between p-3 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center text-xs font-bold">
                  !
                </div>
                <div>
                  <p className="text-xs font-bold text-text-main">Burnout Fingerprint</p>
                  <p className="text-[10px] text-text-muted font-semibold">Diagnostic Questionnaire</p>
                </div>
              </div>
              <button 
                onClick={() => onNavigateTab('diagnose')}
                className="btn-primary py-1.5 px-4 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5"
              >
                Diagnose Now <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center text-xs font-bold">
                  ✓
                </div>
                <div>
                  <p className="text-xs font-bold text-text-main">Recovery Debt tracker</p>
                  <p className="text-[10px] text-text-muted font-semibold">Physiological Audit Matrix</p>
                </div>
              </div>
              <span className="text-[10px] text-success font-black uppercase tracking-widest bg-success/15 border border-success/20 px-2 py-1 rounded-md">
                Active
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ACTIVE UNLOCKED STATE RENDER
  const archetype = fingerprint.profile || 'High-Functioning Exhausted';
  const planDetails = {
    "High-Functioning Exhausted": {
      scenario: "Your CEO requests a late-night status slide update at 7:30 PM. It represents an energy leak. What is your pushback?",
      exampleScript: "I'll outline the status report first thing at 8:30 AM so we can sync immediately before the morning call."
    },
    "Over-Giver": {
      scenario: "A peer asks you to absorb their team's project review slide preparation during your scheduled 3 PM recovery walk. What is your boundary?",
      exampleScript: "I won't be able to review this during my focus window. I can give feedback tomorrow morning instead."
    },
    "Silent Resenter": {
      scenario: "Your team slides an extra meeting into your Friday afternoon. You are tired and resentful. How do you push back firmly?",
      exampleScript: "I am offline this afternoon to preserve recovery. Let's schedule a 15-minute sync on Monday morning instead."
    },
    "Founder on Fire": {
      scenario: "An executive client requests a Saturday client status meeting. It threatens your nervous system stability. What is your firm boundary?",
      exampleScript: "To maintain baseline service quality, our team is offline over the weekend. I will follow up via email on Monday morning."
    },
    "Manager in the Middle": {
      scenario: "Upper leadership asks for a sudden delivery projection over the weekend. What is yourCapacity protection script?",
      exampleScript: "I will align with the team on Monday morning and deliver our revised capacity projections by midday."
    },
    "The Impostor": {
      scenario: "A colleague praises a project you led as if it were effortless, and your instinct is to explain how much you actually struggled. What do you say instead?",
      exampleScript: "Thank you — I put real thought into that, and I'm glad it landed well."
    },
    "The Perfectionist": {
      scenario: "A teammate hands you a task done to 90% of your usual standard, and it's genuinely fine for the brief. What do you do?",
      exampleScript: "This meets what we needed. I'm going to leave it as is rather than adjust it."
    },
    "The Constant Adapter": {
      scenario: "Your calendar has four back-to-back meetings with no gap, and you know you'll need a moment to reset between them. What do you ask for?",
      exampleScript: "I need a short buffer between these two — could we shift one by 15 minutes?"
    },
    "The Second Shift": {
      scenario: "Work asks for your availability during a window you've reserved for caregiving. What is your response?",
      exampleScript: "I have a firm commitment during that time. I can pick this up right after."
    },
    "Crisis Sprinter": {
      scenario: "A request comes in framed as urgent, but on reflection it can genuinely wait. What do you say?",
      exampleScript: "I'll pick this up properly tomorrow morning — nothing here needs a same-day turnaround."
    },
    "People-Pleasing Performer": {
      scenario: "A colleague asks how you're doing, and the honest answer is 'not great.' What do you say instead of the automatic 'fine'?",
      exampleScript: "Honestly, it's been a heavy week — appreciate you asking."
    },
    "Responsibility Addict": {
      scenario: "Something goes wrong on a project that isn't officially your responsibility, and your instinct is to step in. What do you say?",
      exampleScript: "That's not mine to fix — I trust it'll get handled by the right person."
    }
  }[archetype] || {
    scenario: "A sudden out-of-scope deliverable lands on your desk at 5 PM. How do you hold your capacity line?",
    exampleScript: "I'll review this first thing tomorrow and update our timeline expectations then."
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-24">
      {/* 1. Header Synthesis */}
      <div className="card glass border-primary/20 bg-primary/5 space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-primary/15 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-lg shadow-primary/20">
              <Unlock className="w-5 h-5 animate-pulse text-warning" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-[0.25em] font-black text-primary">Nova Recovery Synthesis</span>
              <h2 className="text-2xl font-display font-bold text-text-main tracking-tight">Personalized Recovery Plan</h2>
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="tag text-xs bg-primary/15 border border-primary/20 text-primary font-black uppercase tracking-wider">
              Profile: {archetype}
            </span>
            <span className="text-[10px] text-text-muted mt-1 font-semibold">
              Highest Debt: {highestDebt.label} ({highestDebt.value}{highestDebt.unit})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-warning" />
              <span className="text-[11px] font-black uppercase tracking-widest text-text-main">Nova's Direct Diagnosis</span>
            </div>
            <p className="text-sm text-text-muted leading-relaxed font-serif italic border-l-2 border-warning/40 pl-4">
              "{getNovaSynthesis()}"
            </p>
          </div>
          
          <div className="bg-surface dark:bg-surface/30 p-4 rounded-2xl border border-border flex flex-col justify-between">
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Systemic Health Indicators</span>
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-text-main">{highestDebt.label} Load</span>
                <span className="font-mono font-bold text-red-500">{Math.round(highestDebtRatio * 100)}%</span>
              </div>
              <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-500 rounded-full"
                  style={{ width: `${highestDebtRatio * 100}%` }}
                />
              </div>
            </div>
            <div className="mt-4 text-[10px] text-text-muted leading-relaxed">
              *Completing items below immediately patches this energy leak and lowers your physiological debt.
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Plan Checklist & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* checklist column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Daily Recovery Rhythm Checklist</h3>
            <span className="text-xs font-bold text-primary tracking-widest bg-primary/10 px-2 py-0.5 rounded">
              {actions.filter(a => a.completed).length} / {actions.length} Completed
            </span>
          </div>

          <div className="space-y-4">
            {actions.map((act) => {
              const isDone = act.completed;
              const sectionColors = {
                Recover: 'text-rose-500 bg-rose-500/10 border-rose-500/25',
                Communicate: 'text-warning bg-warning/10 border-warning/25',
                Reflect: 'text-teal-500 bg-teal-500/10 border-teal-500/25'
              }[act.section];

              return (
                <motion.div
                  key={act.id}
                  whileHover={{ y: -1 }}
                  className={cn(
                    "p-5 rounded-2xl border transition-all flex items-start gap-4 relative overflow-hidden",
                    isDone 
                      ? "bg-success/10 border-success/40" 
                      : "bg-card border-border hover:border-border/80"
                  )}
                >
                  <button
                    onClick={() => handleToggleCheck(act.id, act.points)}
                    className={cn(
                      "w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-all cursor-pointer mt-0.5",
                      isDone 
                        ? "bg-success border-success text-white" 
                        : "border-border text-transparent bg-surface hover:bg-white/10"
                    )}
                  >
                    <Check className="w-4 h-4 stroke-[3px]" />
                  </button>

                  <div className="flex-1 space-y-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border", sectionColors)}>
                        {act.section}
                      </span>
                      <span className="text-[10px] text-text-muted font-bold">
                        {act.tag}
                      </span>
                    </div>
                    <p className={cn("text-xs font-semibold leading-relaxed text-text-main", isDone ? "line-through text-text-muted opacity-60" : "")}>
                      {act.text}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={cn("text-xs font-black tracking-tight", isDone ? "text-success" : "text-primary")}>
                      {isDone ? 'Claimed' : `+${act.points} XP`}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Practice Boundary Console */}
          <div className="card space-y-6 border border-border">
            <div className="flex items-center gap-2 text-warning font-bold uppercase tracking-widest text-xs border-b border-border pb-3">
              <MessageSquare className="w-4 h-4" /> Communicate Lab: Boundary Rehearsal Room
            </div>
            
            <div className="space-y-2 text-left">
              <span className="text-[10px] uppercase tracking-widest font-black text-text-muted">Target Scenario ({archetype})</span>
              <p className="text-xs font-bold text-text-main leading-relaxed bg-surface dark:bg-surface/50 p-4 rounded-xl border border-border">
                {planDetails.scenario}
              </p>
            </div>

            {rehearsalStep === 0 && (
              <button 
                onClick={() => setRehearsalStep(1)}
                className="w-full btn-primary py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/10"
              >
                Launch Professional Pushback Practice (+75 XP)
              </button>
            )}

            {rehearsalStep === 1 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4"
              >
                <div className="space-y-1 text-left">
                  <label className="text-xs text-text-muted italic">Type your highly professional, firm boundary script:</label>
                  <textarea
                    placeholder="E.g. I will address this first thing during normal capacity..."
                    value={rehearsalText}
                    onChange={(e) => setRehearsalText(e.target.value)}
                    rows={3}
                    className="w-full bg-surface dark:bg-surface/50 border border-border rounded-xl p-3 text-xs text-text-main placeholder-text-muted/40 focus:outline-none focus:border-primary/50 font-normal"
                  />
                  <div className="flex justify-between items-center text-[10px] text-text-muted">
                    <span>Example: "{planDetails.exampleScript}"</span>
                    <span>{rehearsalText.length} chars</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setRehearsalStep(0)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-text-muted hover:bg-surface border border-border"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleBoundaryRehearsalSubmit}
                    disabled={rehearsalText.trim().length < 10}
                    className="flex-1 bg-primary hover:bg-primary-dark text-primary-foreground font-black text-xs uppercase tracking-widest py-2 rounded-xl shadow-lg shadow-primary/15 disabled:opacity-50"
                  >
                    Commit & Record
                  </button>
                </div>
              </motion.div>
            )}

            {rehearsalStep === 2 && (
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="p-4 bg-success/10 border border-success/30 rounded-xl text-center space-y-3"
              >
                <div className="w-8 h-8 rounded-full bg-success text-white flex items-center justify-center mx-auto">
                  <Check className="w-4 h-4 stroke-[3px]" />
                </div>
                <h4 className="text-xs font-bold text-success uppercase tracking-wider">Boundary Rehearsal Complete</h4>
                <p className="text-[11px] text-text-muted font-medium">Your nerve system memory has been upgraded. Consistent practice turns pushback into default habits.</p>
                <button 
                  onClick={() => setRehearsalStep(1)}
                  className="text-xs text-primary hover:underline font-bold"
                >
                  Practice Again
                </button>
              </motion.div>
            )}
          </div>
        </div>

        {/* Side column: Reflections and Leaderboard */}
        <div className="space-y-6">
          
          {/* Reflection Journal entry card */}
          <div className="card space-y-4 border border-border text-left">
            <div className="flex items-center gap-2 text-teal-500 font-bold uppercase tracking-widest text-xs border-b border-border pb-3">
              <BookOpen className="w-4 h-4" /> Reflect Room: Dynamic Journal
            </div>
            
            <p className="text-[11px] text-text-muted font-medium leading-relaxed">
              Identify your biggest fawning/pleasing leak today. Nova analyzes saved reflections to adjust capacity targets.
            </p>

            <textarea
              placeholder="What triggered a people-pleasing moment today? How did your physical body feel?..."
              value={journalText}
              onChange={(e) => setJournalText(e.target.value)}
              rows={3}
              className="w-full bg-surface dark:bg-surface/50 border border-border rounded-xl p-3 text-xs text-text-main placeholder-text-muted/40 focus:outline-none focus:border-primary/50 font-normal"
            />

            <button
              onClick={handleJournalSubmit}
              disabled={journalText.trim().length < 10}
              className="w-full bg-primary hover:bg-primary-dark text-primary-foreground font-black text-xs uppercase tracking-widest py-2 rounded-xl shadow-lg shadow-primary/15 disabled:opacity-50"
            >
              Save Journal Entry (+50 XP)
            </button>

            {submittedJournals.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Saved Entries</span>
                <div className="max-h-24 overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
                  {submittedJournals.map((j, i) => (
                    <p key={i} className="text-[10px] text-text-muted leading-relaxed font-serif bg-surface dark:bg-surface/40 p-2 rounded border border-border/50 truncate" title={j}>
                      {j}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Gamified Community Leaderboard */}
          <div className="card space-y-6 border border-border">
            <div className="flex flex-col space-y-1 text-left border-b border-border pb-3">
              <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-xs">
                <Users className="w-4 h-4" /> Anonymized Leaderboard
              </div>
              <span className="text-[10px] text-text-muted font-semibold">Practice regulation together, safely</span>
            </div>

            {/* Nickname setting & Opt-in */}
            <div className="p-4 bg-surface dark:bg-surface/50 rounded-2xl border border-border space-y-4 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-main">Join Community Sync</span>
                <input 
                  type="checkbox"
                  checked={optInLeaderboard}
                  onChange={(e) => handleToggleLeaderboard(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary focus:ring-opacity-40 w-4 h-4 cursor-pointer"
                />
              </div>

              {optInLeaderboard && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Your Nickname</label>
                  {isEditingNickname ? (
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        maxLength={20}
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="bg-card border border-border text-xs px-2 py-1 rounded focus:outline-none flex-1 font-bold text-text-main"
                      />
                      <button 
                        onClick={saveNickname}
                        className="bg-primary text-primary-foreground text-[10px] uppercase font-black px-3 rounded"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-card p-2 rounded border border-border">
                      <span className="text-xs font-bold text-primary font-mono">{nickname}</span>
                      <button 
                        onClick={() => setIsEditingNickname(true)}
                        className="text-[10px] text-text-muted hover:text-text-main underline cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Leaderboard Table */}
            <div className="space-y-2 text-left">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Weekly Sync Rank</span>
              <div className="border border-border rounded-xl overflow-hidden bg-surface dark:bg-surface/30">
                {leaderboardEntries.map((peer, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "flex items-center justify-between p-3 text-xs border-b border-border/40 last:border-none",
                      peer.isUser ? "bg-primary/10 font-bold" : ""
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black",
                        idx === 0 ? "bg-warning/20 text-warning" : 
                        idx === 1 ? "bg-slate-400/20 text-slate-300" : 
                        idx === 2 ? "bg-amber-600/20 text-amber-500" : "bg-card text-text-muted"
                      )}>
                        {idx + 1}
                      </span>
                      <span className={cn("truncate max-w-[120px] font-mono", peer.isUser ? "text-primary" : "text-text-main")}>
                        {peer.name}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] uppercase tracking-widest font-black text-text-muted">
                        {peer.stage}
                      </span>
                      <span className="font-mono font-bold text-text-main">
                        {peer.points} pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

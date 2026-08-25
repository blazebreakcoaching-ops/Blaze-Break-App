import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useFocusTrap } from '../lib/useFocusTrap';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  Activity, 
  Brain, 
  Battery, 
  ShieldAlert, 
  Zap, 
  Crown,
  Layers,
  Award,
  Play,
  ArrowRight,
  MessageSquare,
  ShieldCheck,
  HeartPulse,
  Compass,
  RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface WalkthroughStep {
  title: string;
  pill: string;
  description: string;
  recoveryInference: string;
  icon: React.ComponentType<any>;
  themeColor: string;
}

export const Walkthrough = ({ 
  isOpen, 
  onClose,
  onAwardPoints
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onAwardPoints?: (amount: number, reason: string) => void;
}) => {
  const [activeModule, setActiveModule] = useState<'selection' | 'module_a' | 'module_b' | 'general_tour'>('selection');
  const [currentStep, setCurrentStep] = useState(0);
  const dialogRef = useFocusTrap(isOpen);
  const isFirstStepRenderRef = useRef(true);

  useEffect(() => {
    if (!isOpen) {
      isFirstStepRenderRef.current = true;
      return;
    }
    if (isFirstStepRenderRef.current) {
      isFirstStepRenderRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      const heading = (dialogRef.current as HTMLElement | null)?.querySelector<HTMLElement>('h1, h2, h3, h4');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen, activeModule, currentStep]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Module A (Boundary Rehearsal) States
  const [selectedScriptId, setSelectedScriptId] = useState<'creep' | 'meeting' | 'weekend'>('creep');
  const [practiceInput, setPracticeInput] = useState('');
  const [rehearsalFeedback, setRehearsalFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Module B (Somatic Reset Test) States
  const [selectedTrigger, setSelectedTrigger] = useState<'racing' | 'chest' | 'dread'>('racing');
  const [isBreathingActive, setIsBreathingActive] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');
  const [breathTimer, setBreathTimer] = useState(4);
  const [somaticComplete, setSomaticComplete] = useState(false);

  const steps: WalkthroughStep[] = [
    {
      title: "Welcome to Blaze Break Recovery System",
      pill: "The Recovery Operating System",
      description: "Blaze Break is a structured burnout recovery system designed to help ambitious high-achievers transition safely from chronic fatigue back to elite, sustainable performance. We align nervous system regulation with action.",
      recoveryInference: "Recovery isn't just relaxation—it is a cognitive structural upgrade. Let's review the core engines of your workspace.",
      icon: Crown,
      themeColor: "from-amber-500/10 to-orange-500/10 text-warning border-warning/20"
    },
    {
      title: "The Burnout Diagnostic & Fingerprint",
      pill: "Pillar 1: Diagnostic Profile",
      description: "Take the assessment to find your burnout archetype — 12 real patterns, from Founder on Fire to The Impostor to Crisis Sprinter — plus your actual blend, not just one label. Spotting the pattern is what prevents it from repeating.",
      recoveryInference: "Helps you surface where your energy is actually leaking, before it turns into full burnout.",
      icon: ShieldAlert,
      themeColor: "from-destructive/10 to-destructive/5 text-destructive border-destructive/20"
    },
    {
      title: "Your Recovery Score & Dashboard",
      pill: "Pillar 2: Ledger & Dashboard",
      description: "Track your Recovery Score in real time. Completing recovery actions and staying consistent moves the number — a clear, honest read on where you actually stand.",
      recoveryInference: "Consistency is what actually moves the score. Streaks aren't just gamification — they're the pattern that prevents relapse.",
      icon: Activity,
      themeColor: "from-emerald-500/10 to-teal-500/10 text-success border-success/20"
    },
    {
      title: "Energy Budget",
      pill: "Pillar 3: Load Allocator",
      description: "Don't take on tasks blindly. Set a weekly energy budget, assign your SHIP recovery stage to each task, and see clearly what you can actually handle right now.",
      recoveryInference: "Tasks that match your current SHIP stage are flagged as 'Phase Anchors' — the ones worth prioritizing while you recover.",
      icon: Battery,
      themeColor: "from-primary/10 to-primary/5 text-primary border-primary/20"
    },
    {
      title: "Boundary Rehearsal Workroom",
      pill: "Pillar 4: Boundary Rehearsal",
      description: "Practice saying no before you actually have to. Rehearse real scripts against a tough roleplay partner (the pushy boss, the demanding client) and build the confidence to hold the line.",
      recoveryInference: "Saying 'no' gets easier with practice — this builds the muscle before you need it in the moment.",
      icon: Zap,
      themeColor: "from-primary/15 to-primary/5 text-primary border-primary/25"
    },
    {
      title: "Nova AI – Strategic Recovery Coach",
      pill: "Pillar 5: Coached Training",
      description: "Nova is your direct, honest recovery coach. She checks in on your patterns, remembers your history, and helps you actually work through what's going on — not generic advice.",
      recoveryInference: "Direct and specific, not therapist platitudes — practical guidance that actually accounts for your situation.",
      icon: Brain,
      themeColor: "from-primary/10 to-primary/10 text-primary border-primary/20"
    },
    {
      title: "Settings & Controls",
      pill: "Governance Layer",
      description: "Toggle experimental features on or off, and review what Nova remembers about you. Your feedback on her advice helps her get better over time.",
      recoveryInference: "You're always in control — full transparency into what's tracked and what Nova knows.",
      icon: Layers,
      themeColor: "from-surface to-surface text-text-muted border-border"
    }
  ];

  // Breeding Pacer loop logic inside Walkthrough
  useEffect(() => {
    if (!isBreathingActive) return;
    const interval = setInterval(() => {
      setBreathTimer((prev) => {
        if (prev <= 1) {
          if (breathPhase === 'Inhale') {
            setBreathPhase('Hold');
            return 3;
          } else if (breathPhase === 'Hold') {
            setBreathPhase('Exhale');
            return 5;
          } else {
            setBreathPhase('Inhale');
            setSomaticComplete(true);
            return 4;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isBreathingActive, breathPhase]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      if (onAwardPoints) {
        onAwardPoints(30, "Interactive Workspace Walkthrough Graduated");
      }
      setActiveModule('selection');
      setCurrentStep(0);
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const navigateTabDirect = (tabName: string) => {
    window.dispatchEvent(new CustomEvent('navigate_tab', { detail: tabName }));
    onClose();
  };

  // Simulated critique engine adhering strictly to Nova's analytical, direct and slightly provocative persona
  const generateSimulatedCritique = () => {
    if (!practiceInput.trim()) return;
    setFeedbackLoading(true);
    setTimeout(() => {
      let score = 0;
      let critiqueText = '';
      const lowercase = practiceInput.toLowerCase();

      // Check for performance identity & fawning patterns
      const hasApology = lowercase.includes('sorry') || lowercase.includes('apologize') || lowercase.includes('pardon') || lowercase.includes('regret');
      const isFirm = lowercase.includes('priority') || lowercase.includes('schedule') || lowercase.includes('resource') || lowercase.includes('deadline') || lowercase.includes('capacity');

      if (hasApology) {
        score = 45;
        critiqueText = "Nova: I spotted fawning behavior. You apologized. High achievers use apologies to soften social friction, but it signals vulnerability and invites pushback. Re-read the script: state your capacity as an equation, not a moral failure.";
      } else if (isFirm) {
        score = 88;
        critiqueText = "Nova: Excellent firm boundaries. You clearly outlined parameters of capacity and resource tradeoffs without feeling defensive. This prevents cognitive overload and retains full executive command.";
      } else {
        score = 65;
        critiqueText = "Nova: Your response is polite, but too soft. It leaves room for interpretation. In corporate dynamics, ambiguity is always filled by more scope. State exactly what gets delayed.";
      }

      setRehearsalFeedback(`${critiqueText}\n\nBoundary Firmness Rating: ${score}/100.`);
      setFeedbackLoading(false);
      if (onAwardPoints) {
        onAwardPoints(25, "Completed Simulated Boundary Rehearsal");
      }
    }, 1200);
  };

  const active = steps[currentStep];
  const Icon = active?.icon || Crown;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          {/* Overlay card */}
          <motion.div
            ref={dialogRef as any}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 180 }}
            role="dialog"
            aria-modal="true"
            aria-label="Guided walkthrough"
            tabIndex={-1}
            className="w-full max-w-2xl bg-white dark:bg-card rounded-xl border border-border shadow-lg relative overflow-hidden my-8"
          >
            {/* Header / progress ribbon */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-surface dark:bg-card/40 flex">
              {activeModule === 'general_tour' && steps.map((_, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "h-full flex-1 transition-all duration-300",
                    i <= currentStep ? "bg-primary" : "bg-transparent opacity-20"
                  )}
                />
              ))}
              {activeModule !== 'general_tour' && (
                <div className="h-full w-full bg-primary" />
              )}
            </div>

            {/* Close trigger */}
            <button
              onClick={onClose}
              aria-label="Close walkthrough"
              className="absolute top-6 right-6 p-2 rounded-full text-text-muted hover:text-text-main hover:bg-surface dark:hover:bg-neutral-800 transition-colors cursor-pointer z-50"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Module Selection Landing */}
            {activeModule === 'selection' && (
              <div className="p-8 md:p-12 space-y-8 text-center">
                <div className="space-y-3">
                  <div className="inline-flex p-3 bg-primary/10 text-primary rounded-2xl border border-primary/20">
                    <Compass className="w-8 h-8 animate-spin-slow" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-display font-black text-text-main tracking-tight leading-tight">
                    Choose Your Guided Recovery Test
                  </h3>
                  <p className="text-xs text-text-muted uppercase tracking-[0.2em] font-black">
                    Guided by Nova — High-Performance Recovery Coach
                  </p>
                  <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
                    Practice vital micro-skills and stress de-escalations instantly to strengthen your neuro-stability score.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                  {/* Option A */}
                  <button
                    onClick={() => {
                      setActiveModule('module_a');
                      setPracticeInput('');
                      setRehearsalFeedback(null);
                    }}
                    className="p-5 rounded-2xl bg-surface dark:bg-card border border-border hover:border-primary/40 hover:bg-primary/[0.02] transition-all text-left space-y-3 group"
                  >
                    <div className="flex justify-between items-center">
                      <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                        <Zap className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] uppercase font-black tracking-widest text-[#9a3412] dark:text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        Module A
                      </span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-text-main flex items-center gap-1 group-hover:text-primary transition-colors">
                        Boundary Rehearsal
                      </h4>
                      <p className="text-xs text-text-muted leading-relaxed">
                        Rehearse critical verbal negotiators and stop performance fawning under sudden manager demands.
                      </p>
                    </div>
                  </button>

                  {/* Option B */}
                  <button
                    onClick={() => {
                      setActiveModule('module_b');
                      setIsBreathingActive(false);
                      setSomaticComplete(false);
                    }}
                    className="p-5 rounded-2xl bg-surface dark:bg-card border border-border hover:border-destructive/40 hover:bg-destructive/[0.02] transition-all text-left space-y-3 group"
                  >
                    <div className="flex justify-between items-center">
                      <div className="p-2.5 bg-destructive/10 text-destructive rounded-xl">
                        <HeartPulse className="w-5 h-5 animate-pulse" />
                      </div>
                      <span className="text-[10px] uppercase font-black tracking-widest text-destructive dark:text-[#f87171] bg-destructive/10 px-2 py-0.5 rounded-full">
                        Module B
                      </span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-text-main flex items-center gap-1 group-hover:text-destructive transition-colors">
                        Somatic Anxiety Reset
                      </h4>
                      <p className="text-xs text-text-muted leading-relaxed">
                        Use micro-breathwork and sensory grounding anchors to help break high autonomic arousal states.
                      </p>
                    </div>
                  </button>
                </div>

                <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <span className="text-xs text-text-muted font-mono">
                    First time here? Try the general overview.
                  </span>
                  <button
                    onClick={() => setActiveModule('general_tour')}
                    className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-text-main rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 border border-border"
                  >
                    System Tour <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Module A: Boundary Rehearsal Simulation */}
            {activeModule === 'module_a' && (
              <div className="p-8 md:p-12 space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-display text-lg font-bold text-text-main">Module A: Boundary Rehearsal</h4>
                      <p className="text-[10px] text-text-muted uppercase tracking-widest font-black">Interactive Nova Simulator</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveModule('selection')}
                    className="px-3 py-1 bg-surface hover:bg-card border border-border rounded-lg text-[10px] uppercase font-black tracking-wider text-text-muted transition-colors"
                  >
                    Change Module
                  </button>
                </div>

                <div className="space-y-4">
                  <span className="text-xs font-black uppercase tracking-wider text-text-muted">
                    1. Select Workplace Scenario
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'creep', label: 'The Scope Creep Block', desc: 'Manager adds a mid-week surprise project.' },
                      { id: 'meeting', label: 'Decline Late Meetings', desc: 'Stakeholder invites you to a 16:00 brain drain.' },
                      { id: 'weekend', label: 'Weekend Client Lockout', desc: 'High-maintenance client expects Sunday response.' }
                    ].map((scen) => (
                      <button
                        key={scen.id}
                        onClick={() => {
                          setSelectedScriptId(scen.id as any);
                          setRehearsalFeedback(null);
                        }}
                        aria-pressed={selectedScriptId === scen.id}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all space-y-1",
                          selectedScriptId === scen.id
                            ? "bg-primary/10 border-primary text-text-main"
                            : "bg-surface dark:bg-card/40 border-border hover:border-primary/20 text-text-muted"
                        )}
                      >
                        <h5 className="font-bold text-xs">{scen.label}</h5>
                        <p className="text-[10px] opacity-80 leading-snug">{scen.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Script Display */}
                <div className="p-4 bg-surface rounded-xl border border-border space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary block">
                    Nova Approved Coping Script:
                  </span>
                  <p className="text-xs italic font-serif text-text-main leading-relaxed">
                    {selectedScriptId === 'creep' && '"I\'ve reviewed the requirements. To deliver this to the standard we need, I\'ll need to push the final review of [Current Project] to Tuesday. Which takes priority?"'}
                    {selectedScriptId === 'meeting' && '"I\'ve reached capacity for deep focus today. Let\'s move this discussion to my 10 AM block tomorrow when I can give it my full cognitive energy."'}
                    {selectedScriptId === 'weekend' && '"To maintain the quality of service I provide my clients, I dedicate weekends to recovery so I\'m fully available on Monday. I\'ll answer by noon today."'}
                  </p>
                  <span className="text-[9px] text-text-muted block font-mono">
                    💡 Frame capacity as a professional quality threshold, not a personal weakness.
                  </span>
                </div>

                {/* User practice input */}
                <div className="space-y-3">
                  <span className="text-xs font-black uppercase tracking-wider text-text-muted flex justify-between">
                    <span>2. Rehearse Your Custom Response</span>
                    <span className="text-text-muted font-mono normal-case">Try adding or omitting apologies</span>
                  </span>
                  <textarea
                    rows={3}
                    value={practiceInput}
                    onChange={(e) => setPracticeInput(e.target.value)}
                    placeholder="Type or copy your response to test against Nova's analytical boundaries (e.g. 'I can do that, but to maintain quality I need...')"
                    className="w-full bg-surface dark:bg-card border border-border p-3 text-xs rounded-xl focus:outline-none focus:border-primary"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={generateSimulatedCritique}
                      disabled={feedbackLoading || !practiceInput.trim()}
                      className="px-6 py-2.5 bg-primary hover:opacity-90 disabled:opacity-30 text-primary-foreground font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-md shadow-primary/10 flex items-center gap-2"
                    >
                      {feedbackLoading ? 'Processing...' : 'Submit to Nova for Critique'} <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Nova Feedback Section */}
                <AnimatePresence>
                  {rehearsalFeedback && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      role="status"
                      aria-live="polite"
                      className="p-5 bg-primary/20 border border-primary/20 rounded-2xl space-y-3"
                    >
                      <span className="text-[10px] uppercase font-black tracking-widest text-[#9a3412] dark:text-primary block">
                        Boundary Script Feedback
                      </span>
                      <p className="text-xs text-text-muted leading-relaxed whitespace-pre-line">
                        {rehearsalFeedback}
                      </p>
                      <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row gap-3 justify-between items-center">
                        <span className="text-[10px] text-[#166534] dark:text-[#4ade80] font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 fill-current" /> Simulated Rehearsal Recorded (+25 pts)
                        </span>
                        <button
                          onClick={() => navigateTabDirect('communicate')}
                          className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-[10px] uppercase font-black tracking-wider rounded-lg transition-colors flex items-center gap-1"
                        >
                          Launch Full Workroom <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Module B: Somatic Anxiety Reset Test */}
            {activeModule === 'module_b' && (
              <div className="p-8 md:p-12 space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-destructive/10 text-destructive rounded-xl">
                      <HeartPulse className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="font-display text-lg font-bold text-text-main">Module B: Somatic Anxiety Reset</h4>
                      <p className="text-[10px] text-text-muted uppercase tracking-widest font-black">Autonomic Nervous Regulation</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveModule('selection')}
                    className="px-3 py-1 bg-surface hover:bg-card border border-border rounded-lg text-[10px] uppercase font-black tracking-wider text-text-muted transition-colors"
                  >
                    Change Module
                  </button>
                </div>

                <div className="space-y-4">
                  <span className="text-xs font-black uppercase tracking-wider text-text-muted">
                    1. Identify Stress Trigger
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'racing', label: 'Racing Thoughts', desc: 'Overthinking cycles' },
                      { id: 'chest', label: 'Chest Tightness', desc: 'Physical arousal' },
                      { id: 'dread', label: 'Work Dread', desc: 'Ambitious burnout' }
                    ].map((trig) => (
                      <button
                        key={trig.id}
                        onClick={() => {
                          setSelectedTrigger(trig.id as any);
                          setSomaticComplete(false);
                          setIsBreathingActive(false);
                        }}
                        aria-pressed={selectedTrigger === trig.id}
                        className={cn(
                          "p-3 rounded-xl border text-center transition-all space-y-1",
                          selectedTrigger === trig.id
                            ? "bg-destructive/10 border-destructive text-text-main"
                            : "bg-surface dark:bg-card/40 border-border hover:border-destructive/20 text-text-muted"
                        )}
                      >
                        <h5 className="font-bold text-xs">{trig.label}</h5>
                        <p className="text-[9px] opacity-80">{trig.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Breathing Pacer Simulator block */}
                <div className="p-6 bg-surface dark:bg-card rounded-2xl border border-border flex flex-col items-center justify-center space-y-4 text-center relative overflow-hidden">
                  <div className="absolute top-2 left-3 text-[9px] font-mono text-text-muted uppercase">
                    Breathwork Loop (Simulated)
                  </div>

                  {/* Pacer Visual Circle */}
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <AnimatePresence mode="popLayout">
                      <motion.div
                        key={breathPhase}
                        initial={{ scale: breathPhase === 'Inhale' ? 0.8 : 1.3 }}
                        animate={{ 
                          scale: breathPhase === 'Inhale' ? 1.3 : breathPhase === 'Hold' ? 1.3 : 0.8 
                        }}
                        transition={{ duration: breathPhase === 'Inhale' ? 4 : breathPhase === 'Hold' ? 3 : 5, ease: "easeInOut" }}
                        className={cn(
                          "absolute inset-0 rounded-full bg-gradient-to-br transition-colors duration-1000 blur-sm opacity-20",
                          breathPhase === 'Inhale' ? 'from-red-500 to-amber-500' : 'from-indigo-500 to-teal-500'
                        )}
                      />
                    </AnimatePresence>
                    <div className="w-24 h-24 rounded-full border-2 border-dashed border-destructive/40 flex flex-col items-center justify-center z-10 bg-card">
                      <span className="text-xs font-black uppercase text-destructive tracking-wider">
                        {isBreathingActive ? breathPhase : 'Standby'}
                      </span>
                      {isBreathingActive && (
                        <span className="text-xl font-display font-black text-text-main mt-0.5">
                          {breathTimer}s
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1" role="status" aria-live="polite" aria-atomic="true">
                    <p className="text-xs font-bold text-text-main">
                      {!isBreathingActive ? "Ready to test somatic down-regulation?" : `Breath Phase: ${breathPhase}`}
                    </p>
                    <p className="text-[10px] text-text-muted max-w-sm">
                      {!isBreathingActive 
                        ? "Initiate a quick 12-second vagus nerve exercise. Nova's pacing activates the parasympathetic branch immediately."
                        : breathPhase === 'Inhale' ? "Breathe in slowly through your nose. Expand your chest."
                        : breathPhase === 'Hold' ? "Suspend breath. Hold space for your autonomic tone to settle."
                        : "Exhale fully through pursed lips. Let everything release."}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setIsBreathingActive(!isBreathingActive);
                      setBreathTimer(4);
                      setBreathPhase('Inhale');
                    }}
                    className={cn(
                      "px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5",
                      isBreathingActive
                        ? "bg-destructive/10 border border-destructive/30 text-destructive dark:text-[#f87171] hover:bg-destructive/20"
                        : "bg-destructive hover:opacity-90 text-destructive-foreground"
                    )}
                    aria-pressed={isBreathingActive}
                  >
                    {isBreathingActive ? (
                      <><RotateCcw className="w-3.5 h-3.5" /> Stop Reset</>
                    ) : (
                      <><Play className="w-3.5 h-3.5" /> Start Pacer Test</>
                    )}
                  </button>
                </div>

                {/* Somatic feedback and de-escalation results */}
                <AnimatePresence>
                  {somaticComplete && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 bg-destructive/20 border border-destructive/20 rounded-2xl space-y-2.5"
                    >
                      <span className="text-[10px] uppercase font-black tracking-widest text-destructive block">
                        Biometric Down-Regulation Profile
                      </span>
                      <p className="text-xs text-text-muted leading-relaxed">
                        <strong>Test Succeeded.</strong> By matching the parasympathetic ratio (4s Inhale, 3s Hold, 5s Exhale), you triggered an instantaneous vagus nerve dampening. Heart rate variability (HRV) increased, and neural fatigue has begun to stabilize.
                      </p>
                      <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row gap-3 justify-between items-center">
                        <span className="text-[10px] text-success font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 fill-current" /> De-escalation Log Saved (+25 pts)
                        </span>
                        <button
                          onClick={() => {
                            if (onAwardPoints) onAwardPoints(25, "Completed Somatic Reset Pacer Test");
                            navigateTabDirect('anxiety_reset');
                          }}
                          className="px-4 py-2 bg-destructive hover:opacity-90 text-destructive-foreground text-[10px] uppercase font-black tracking-wider rounded-lg transition-colors flex items-center gap-1"
                        >
                          Open Full Somatic Studio <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* General System Tour */}
            {activeModule === 'general_tour' && (
              <div className="p-10 md:p-14 space-y-8">
                {/* Pillar pill & icon display */}
                <div className="flex items-center gap-4">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center border bg-gradient-to-br", active.themeColor)}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border bg-gradient-to-r",
                      active.themeColor
                    )}>
                      {active.pill}
                    </span>
                    <div className="text-xs font-mono font-black uppercase text-text-muted mt-1">
                      System Walkthrough • Step {currentStep + 1} of {steps.length}
                    </div>
                  </div>
                </div>

                {/* Title & Description */}
                <div className="space-y-4">
                  <h3 className="text-3xl font-display font-black text-text-main leading-tight tracking-tight">
                    {active.title}
                  </h3>
                  <p className="text-text-muted dark:text-text-muted text-base leading-relaxed font-medium">
                    {active.description}
                  </p>
                </div>

                {/* Recovery Action / Benefit block */}
                <div className="bg-surface dark:bg-surface p-6 rounded-[1.8rem] border border-border/40 space-y-2 flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs uppercase font-black tracking-widest text-primary">Recovery Contribution</h4>
                    <p className="text-xs text-text-muted font-bold font-display mt-1 leading-relaxed">
                      "{active.recoveryInference}"
                    </p>
                  </div>
                </div>

                {/* Action Buttons footer */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <button
                    onClick={handlePrev}
                    disabled={currentStep === 0}
                    className={cn(
                      "px-6 py-3 rounded-xl border border-border text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all",
                      currentStep === 0 
                        ? "opacity-30 cursor-not-allowed" 
                        : "text-text-muted hover:bg-surface dark:hover:bg-neutral-800 hover:text-text-main cursor-pointer"
                    )}
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveModule('selection')}
                      className="px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-surface dark:hover:bg-neutral-800 text-text-muted cursor-pointer transition-colors"
                    >
                      Exit to Modules
                    </button>
                    <button
                      onClick={handleNext}
                      className="px-8 py-3.5 bg-primary hover:opacity-90 text-primary-foreground rounded-xl text-xs font-black uppercase tracking-[0.15em] flex items-center gap-2 shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                    >
                      {currentStep === steps.length - 1 ? (
                        <>Graduate Tour (+30 pts) <Sparkles className="w-4 h-4" /></>
                      ) : (
                        <>Next Step <ChevronRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

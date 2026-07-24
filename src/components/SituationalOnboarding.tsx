import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  ArrowRight,
  User,
  Target,
  Shield,
  HeartPulse,
  Brain,
  Lock,
  CheckCircle2,
  Building,
  Activity,
  Briefcase,
  BatteryLow,
} from "lucide-react";
import { UserProfileData } from "../types";
import { cn } from "../lib/utils";

interface OnboardingProps {
  onComplete: (profile: UserProfileData) => void;
}

export const SituationalOnboarding = ({ onComplete }: OnboardingProps) => {
  const [step, setStep] = useState(0);

  const [profile, setProfile] = useState<UserProfileData>({
    fullName: "",
    role: "",
    organization: "",
    pathway: "",
    purpose: "",
    novaTone: "direct",
    primaryDrain: "",
  } as any);

  const steps = [
    {
      id: "welcome",
      title: "Welcome. Let's take this one step at a time.",
      subtitle: "A few quick questions to help Nova understand where you're at.",
      icon: Sparkles,
      question: "What brought you here today?",
      options: [
        { label: "I need to restore my energy", icon: BatteryLow },
        { label: "I need to disconnect from constant demands", icon: Activity },
        { label: "I want to head off burnout before it hits", icon: Shield },
        { label: "I'm under a lot of pressure right now", icon: Target },
        { label: "I'm trying to support my team well", icon: Briefcase },
      ],
      field: "purpose",
    },
    {
      id: "pathway",
      title: "A bit about your work",
      subtitle: "This helps Nova tailor its support to your situation.",
      icon: Briefcase,
      question: "Which of these sounds most like you?",
      options: [
        { label: "Executive / Founder", icon: Briefcase },
        { label: "Manager / Team Leader", icon: Target },
        { label: "Individual Contributor", icon: User },
        { label: "Entrepreneur", icon: Sparkles },
      ],
      field: "pathway",
    },
    {
      id: "pressure",
      title: "What's weighing on you",
      subtitle: "This helps shape the kind of support that fits you.",
      icon: HeartPulse,
      question: "What's draining you the most right now?",
      options: [
        { label: "Workload and deadlines", icon: Activity },
        { label: "People and expectations", icon: User },
        { label: "Constant notifications and interruptions", icon: HeartPulse },
        { label: "The pressure of leading others", icon: Briefcase },
      ],
      field: "primaryDrain",
    },
    {
      id: "nova_tone",
      title: "How Nova should talk to you",
      subtitle: "Your coach can match the tone that works best for you.",
      icon: Brain,
      question: "How should Nova communicate with you?",
      options: [
        { label: "Direct & Analytical (No fluff)", icon: Brain },
        { label: "Firm & Accountable", icon: Shield },
        { label: "Calm & Reflective", icon: Sparkles },
        { label: "Practical & Structured", icon: Target },
      ],
      field: "novaTone",
    },
    {
      id: "consent",
      title: "Your privacy",
      subtitle: "Your data stays yours. Set your own boundaries below.",
      icon: Lock,
      content: (
        <div className="space-y-6 text-left w-full h-[360px] overflow-y-auto pr-4 custom-scrollbar">
          <div className="p-4 bg-primary-light border border-border rounded-xl mb-4">
            <h4 className="font-bold text-primary flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4" /> How your data is protected
            </h4>
            <p className="text-xs text-text-muted">
              Your entries and personal metrics stay private. If you're using
              this through an employer, they only ever see anonymized,
              aggregated trends — never your individual data.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start justify-between p-4 rounded-xl border border-border bg-surface hover:border-text-muted transition-colors">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-text-main">
                  Personalized Greetings
                </h4>
                <p className="text-xs text-text-muted">
                  Allow Nova to use your preferred name.
                </p>
              </div>
              <button
                onClick={() =>
                  setProfile((p) => ({
                    ...p,
                    useNameInGreetings: !p.useNameInGreetings,
                  }))
                }
                className={cn(
                  "w-10 h-6 shrink-0 rounded-full transition-colors relative",
                  profile.useNameInGreetings !== false
                    ? "bg-primary"
                    : "bg-surface dark:bg-surface",
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded-full bg-surface absolute top-1 transition-transform shadow-sm",
                    profile.useNameInGreetings !== false ? "left-5" : "left-1",
                  )}
                />
              </button>
            </div>

            <div className="flex items-start justify-between p-4 rounded-xl border border-border bg-surface hover:border-text-muted transition-colors">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-text-main">
                  Personalized learning
                </h4>
                <p className="text-xs text-text-muted">
                  Let Nova adjust its suggestions based on your check-ins.
                </p>
              </div>
              <button
                onClick={() =>
                  setProfile((p) => ({ ...p, letNovaLearn: !p.letNovaLearn }))
                }
                className={cn(
                  "w-10 h-6 shrink-0 rounded-full transition-colors relative",
                  profile.letNovaLearn !== false
                    ? "bg-primary"
                    : "bg-surface dark:bg-surface",
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded-full bg-surface absolute top-1 transition-transform shadow-sm",
                    profile.letNovaLearn !== false ? "left-5" : "left-1",
                  )}
                />
              </button>
            </div>

            <div className="flex items-start justify-between p-4 rounded-xl border border-border bg-surface hover:border-text-muted transition-colors">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-text-main">
                  Gentle reminders
                </h4>
                <p className="text-xs text-text-muted">
                  Get occasional check-in prompts when it might help.
                </p>
              </div>
              <button
                onClick={() =>
                  setProfile((p) => ({
                    ...p,
                    sendNovaNudges: !p.sendNovaNudges,
                  }))
                }
                className={cn(
                  "w-10 h-6 shrink-0 rounded-full transition-colors relative",
                  profile.sendNovaNudges !== false
                    ? "bg-primary"
                    : "bg-surface dark:bg-surface",
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded-full bg-surface absolute top-1 transition-transform shadow-sm",
                    profile.sendNovaNudges !== false ? "left-5" : "left-1",
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "profile",
      title: "Just a few details",
      subtitle: "Let's finish setting up your account.",
      icon: User,
      content: null, // Form rendered via custom logic
    },
  ];

  const handleSelect = (field: string, value: string) => {
    setProfile((p) => ({ ...p, [field]: value }));
    if (step < steps.length - 1) {
      setTimeout(() => setStep(step + 1), 400);
    }
  };

  const next = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      if (!profile.fullName.trim()) return;
      onComplete(profile);
    }
  };

  const CurrentIcon = steps[step].icon;

  return (
    <div className="dark min-h-screen bg-background flex items-center justify-center p-6 sm:p-8 relative selection:bg-primary/20 selection:text-primary font-sans text-text-main">
      {/* Background aesthetic */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 left-1/4 w-[500px] h-[500px] bg-teal-500/3 rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#161f30_1px,transparent_1px),linear-gradient(to_bottom,#161f30_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25" />
      </div>

      <div className="max-w-3xl w-full relative z-10 my-12">
        <AnimatePresence mode="wait">
          <motion.div
            layout
            key={step}
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -20 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full p-10 sm:p-20 flex flex-col items-center space-y-12 bg-surface/80 backdrop-blur-3xl border border-white/[0.04] rounded-[2.5rem] shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />

            {/* Onboarding Progress Tracker */}
            <div className="w-full space-y-4 border-b border-white/[0.04] pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary rounded-md border border-primary/25">
                    Stage {step + 1} of {steps.length}
                  </span>
                  <span className="text-xs font-bold text-text-muted">
                    {Math.round(((step + 1) / steps.length) * 100)}% Synchronized
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-text-muted">
                  Setting Up Nova
                </span>
              </div>
              
              {/* Progress track */}
              <div className="flex gap-1.5 w-full">
                {steps.map((s, idx) => {
                  const isDone = idx < step;
                  const isActive = idx === step;
                  return (
                    <div 
                      key={s.id} 
                      className="flex-1 flex flex-col gap-1.5"
                    >
                      <div className="w-full h-1.5 rounded-full relative overflow-hidden bg-white/[0.04]">
                        {(isDone || isActive) && (
                          <motion.div 
                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-indigo-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                          />
                        )}
                      </div>
                      <span className={cn(
                        "hidden sm:block text-[9px] font-bold uppercase tracking-wider truncate text-center",
                        isActive ? "text-primary font-black" : isDone ? "text-text-muted/60" : "text-text-muted/30"
                      )}>
                        {s.id === "nova_tone" ? "Nova" : s.id === "consent" ? "Privacy" : s.id === "welcome" ? "Start" : s.id === "pathway" ? "Context" : s.id === "pressure" ? "Pressure" : s.id === "profile" ? "Profile" : s.id}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-center flex flex-col items-center space-y-6 w-full">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                <CurrentIcon className="w-10 h-10" />
              </div>

              <div className="space-y-4">
                <h2 className="text-4xl font-sans font-bold text-text-main tracking-tight">
                  {steps[step].title}
                </h2>
                <p className="text-text-muted text-base font-medium tracking-tight">
                  {steps[step].subtitle}
                </p>
              </div>
            </div>

            <div className="w-full">
              {steps[step].options ? (
                <div className="space-y-8 w-full">
                  <p className="text-sm font-bold text-text-muted uppercase tracking-widest border-b border-white/10 pb-4">
                    {steps[step].question}
                  </p>
                  <div className="grid gap-4">
                    {steps[step].options.map((opt: any, idx: number) => {
                      const isSelected =
                        (profile as any)[steps[step].field!] === opt.label;
                      const OptIcon = opt.icon;
                      return (
                        <motion.button
                          layout
                          key={`${opt.label}-${idx}`}
                          onClick={() =>
                            handleSelect(steps[step].field!, opt.label)
                          }
                          className={cn(
                            "w-full text-left p-6 sm:px-8 rounded-2xl border transition-all duration-300 flex items-center gap-6 group relative overflow-hidden",
                            isSelected
                              ? "bg-primary/10 border-primary/30 text-primary-foreground shadow-inner scale-[1.02]"
                              : "bg-background border-white/[0.05] hover:border-primary/30 hover:bg-surface text-text-muted hover:text-text-main hover:scale-[1.01]",
                          )}
                        >
                          <div
                            className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center transition-colors shrink-0 border",
                              isSelected
                                ? "bg-primary/20 text-primary border-primary/30"
                                : "bg-surface/50 text-text-muted border-border group-hover:text-primary group-hover:bg-primary/10 group-hover:border-primary/20",
                            )}
                          >
                            <OptIcon className="w-6 h-6" />
                          </div>
                          <span
                            className={cn(
                              "font-sans font-medium text-lg tracking-tight",
                              isSelected ? "font-bold" : "",
                            )}
                          >
                            {opt.label}
                          </span>
                          {isSelected && (
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="ml-auto"
                            >
                              <ArrowRight className="w-6 h-6 text-text-main" />
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ) : steps[step].content ? (
                steps[step].content
              ) : steps[step].id === "profile" ? (
                  <div className="space-y-6 w-full">
                  <div className="space-y-3">
                    <p className="text-xs font-black text-text-muted uppercase tracking-widest pl-1">
                      Full Name / Alias
                    </p>
                    <input
                      type="text"
                      placeholder="e.g. A. Morgan"
                      value={profile.fullName}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, fullName: e.target.value }))
                      }
                      className="w-full bg-background border border-white/[0.05] focus:border-primary/50 text-text-main placeholder:text-text-muted rounded-xl px-5 py-4 text-sm focus:outline-none transition-all shadow-inner font-sans"
                    />
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-black text-text-muted uppercase tracking-widest pl-1">
                      Job Title / Role
                    </p>
                    <input
                      type="text"
                      placeholder="e.g. Director of Operations"
                      value={profile.role}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, role: e.target.value }))
                      }
                      className="w-full bg-background border border-white/[0.05] focus:border-primary/50 text-text-main placeholder:text-text-muted rounded-xl px-5 py-4 text-sm focus:outline-none transition-all shadow-inner font-sans"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="w-full flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-white/[0.05] gap-6">
              <div className="flex gap-2 w-full sm:w-auto justify-center">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === step
                        ? "w-8 bg-primary"
                        : i < step
                          ? "w-3 bg-primary/30"
                          : "w-3 bg-surface",
                    )}
                  />
                ))}
              </div>

              <button
                onClick={next}
                disabled={
                  steps[step].id === "profile" && !profile.fullName.trim()
                }
                className={cn(
                  "w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg",
                  steps[step].id === "profile" && !profile.fullName.trim()
                    ? "bg-background border border-white/[0.05] text-text-muted cursor-not-allowed"
                    : "bg-card text-foreground hover:bg-surface shadow-black/5 dark:shadow-white/10 hover:shadow-black/10 dark:hover:shadow-white/20",
                )}
              >
                {step === steps.length - 1 ? "Get started" : "Continue"}{" "}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

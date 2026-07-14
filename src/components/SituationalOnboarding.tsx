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
      title: "Welcome to the Executive Suite.",
      subtitle: "Let's establish your baseline.",
      icon: Sparkles,
      question: "What is your primary objective today?",
      options: [
        { label: "Restore depleted energy reserves", icon: BatteryLow },
        { label: "Disconnect from relentless demands", icon: Activity },
        { label: "Prevent an impending burnout", icon: Shield },
        { label: "Navigate high-stakes pressure", icon: Target },
        { label: "Support my team as a leader", icon: Briefcase },
      ],
      field: "purpose",
    },
    {
      id: "pathway",
      title: "Operational Context",
      subtitle: "Nova adapts to your specific operational environment.",
      icon: Briefcase,
      question: "Which of these best describes your current reality?",
      options: [
        { label: "Executive / Founder", icon: Briefcase },
        { label: "Manager / Team Leader", icon: Target },
        { label: "High-Performance Individual Core", icon: User },
        { label: "Entrepreneur", icon: Sparkles },
      ],
      field: "pathway",
    },
    {
      id: "pressure",
      title: "Threat Assessment",
      subtitle: "Identifying the root cause dictates the recovery protocol.",
      icon: HeartPulse,
      question: "What is currently draining your reserves the most?",
      options: [
        { label: "Relentless Workload & Deadlines", icon: Activity },
        { label: "People & Complex Expectations", icon: User },
        { label: "Constant Digital Interruptions", icon: HeartPulse },
        { label: "Strategic Leadership Pressure", icon: Briefcase },
      ],
      field: "primaryDrain",
    },
    {
      id: "nova_tone",
      title: "Nova's Configuration",
      subtitle: "Your AI coach can adapt its approach to your needs.",
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
      title: "Data Sovereignty",
      subtitle: "Your data remains yours. Configure Nova's boundaries.",
      icon: Lock,
      content: (
        <div className="space-y-6 text-left w-full h-[360px] overflow-y-auto pr-4 custom-scrollbar">
          <div className="p-4 bg-primary-light border border-border rounded-xl mb-4">
            <h4 className="font-bold text-primary flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4" /> Zero-Trust Architecture
            </h4>
            <p className="text-xs text-text-muted">
              Your transcripts and metrics are strictly isolated. If accessing
              via an organization, only aggregate operational health scores are
              exposed.
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
                  Behavioral Learning Engine
                </h4>
                <p className="text-xs text-text-muted">
                  Allow Nova to adapt dynamically to your check-ins.
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
                  Nova Interventions
                </h4>
                <p className="text-xs text-text-muted">
                  Receive proactive operational nudges.
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
      title: "Executive Profile",
      subtitle: "Finalize your suite credentials.",
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
                  Nova Protocol Initialization
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
                        {s.id === "nova_tone" ? "Nova" : s.id === "consent" ? "Sovereignty" : s.id === "welcome" ? "Objective" : s.id}
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
                      Operational Role
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
                    : "bg-white text-foreground hover:bg-surface shadow-white/10 hover:shadow-white/20",
                )}
              >
                {step === steps.length - 1 ? "Initialize Protocol" : "Proceed"}{" "}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

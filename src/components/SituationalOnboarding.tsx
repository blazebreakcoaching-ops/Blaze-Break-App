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
  Activity,
  Briefcase,
  BatteryLow,
  LogOut,
} from "lucide-react";
import { UserProfileData } from "../types";
import { cn } from "../lib/utils";
import { logAuditAction } from "../lib/audit-logger";
import { useAuth } from "../lib/auth";
import { hasExplicitNovaLearningConsent } from '../lib/nova-learning-consent';
import { deviceTimeZone, validTimeZone } from '../../personal-welcome';
import { useI18n } from '../lib/i18n-react';
import { LanguageSelector } from './LanguageSelector';

interface OnboardingProps {
  onComplete: (profile: UserProfileData) => Promise<void> | void;
}

export const SituationalOnboarding = ({ onComplete }: OnboardingProps) => {
  const { t, locale, setLocale } = useI18n();
  const { logOut, user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [profile, setProfile] = useState<UserProfileData>({
    fullName: "",
    preferredName: "",
    timeZone: deviceTimeZone(),
    // Starts as the language the person is already using (device/browser).
    language: locale,
    greetingTone: "warm",
    greetingEnabled: true,
    useNameInGreetings: false,
    role: "",
    organization: "",
    pathway: "",
    purpose: "",
    novaTone: "direct",
    primaryDrain: "",
    letNovaLearn: false, // A missing answer is never permission to learn.
  } as any);

  const steps = [
    {
      id: "welcome",
      title: t('onboarding.welcomeTitle'),
      subtitle: t('onboarding.welcomeSubtitle'),
      icon: Sparkles,
      question: t('onboarding.welcomeQuestion'),
      options: [
        { label: "I need to restore my energy", display: t('onboarding.choice.energy'), icon: BatteryLow },
        { label: "I need to disconnect from constant demands", display: t('onboarding.choice.disconnect'), icon: Activity },
        { label: "I want to head off burnout before it hits", display: t('onboarding.choice.prevent'), icon: Shield },
        { label: "I'm under a lot of pressure right now", display: t('onboarding.choice.pressure'), icon: Target },
        { label: "I'm trying to support my team well", display: t('onboarding.choice.team'), icon: Briefcase },
      ],
      field: "purpose",
    },
    {
      id: "pathway",
      title: t('onboarding.pathwayTitle'),
      subtitle: t('onboarding.pathwaySubtitle'),
      icon: Briefcase,
      question: t('onboarding.pathwayQuestion'),
      options: [
        { label: "Executive / Founder", display: t('onboarding.choice.executive'), icon: Briefcase },
        { label: "Manager / Team Leader", display: t('onboarding.choice.manager'), icon: Target },
        { label: "Individual Contributor", display: t('onboarding.choice.individual'), icon: User },
        { label: "Entrepreneur", display: t('onboarding.choice.entrepreneur'), icon: Sparkles },
      ],
      field: "pathway",
    },
    {
      id: "pressure",
      title: t('onboarding.pressureTitle'),
      subtitle: t('onboarding.pressureSubtitle'),
      icon: HeartPulse,
      question: t('onboarding.pressureQuestion'),
      options: [
        { label: "Workload and deadlines", display: t('onboarding.choice.workload'), icon: Activity },
        { label: "People and expectations", display: t('onboarding.choice.people'), icon: User },
        { label: "Constant notifications and interruptions", display: t('onboarding.choice.interruptions'), icon: HeartPulse },
        { label: "The pressure of leading others", display: t('onboarding.choice.leadership'), icon: Briefcase },
      ],
      field: "primaryDrain",
    },
    {
      id: "nova_tone",
      title: t('onboarding.novaToneTitle'),
      subtitle: t('onboarding.novaToneSubtitle'),
      icon: Brain,
      question: t('onboarding.novaToneQuestion'),
      options: [
        { label: "Direct & Analytical (No fluff)", display: t('onboarding.choice.direct'), icon: Brain },
        { label: "Firm & Accountable", display: t('onboarding.choice.accountable'), icon: Shield },
        { label: "Calm & Reflective", display: t('onboarding.choice.calm'), icon: Sparkles },
        { label: "Practical & Structured", display: t('onboarding.choice.practical'), icon: Target },
      ],
      field: "novaTone",
    },
    {
      id: "consent",
      title: t("onboarding.privacyTitle"),
      subtitle: t("onboarding.privacySubtitle"),
      icon: Lock,
      content: (
        <div className="space-y-6 text-left w-full h-[360px] overflow-y-auto pr-4 custom-scrollbar">
          <div className="p-4 bg-primary-light border border-border rounded-xl mb-4">
            <h4 className="font-bold text-primary flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4" /> {t("onboarding.protectionTitle")}
            </h4>
            <p className="text-xs text-text-muted">
              {t("onboarding.protectionBody")}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start justify-between p-4 rounded-xl border border-border bg-surface hover:border-text-muted transition-colors">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-text-main">
                  {t("onboarding.greetingConsent")}
                </h4>
                <p className="text-xs text-text-muted">
                  {t("onboarding.greetingConsentDetail")}
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !profile.useNameInGreetings;
                  logAuditAction({
                    userId: profile.fullName || 'anonymous',
                    action: `Toggled consent for personalised_greetings to ${next}`,
                    target: 'personalised_greetings',
                    status: next ? 'authorised' : 'denied',
                    details: 'User explicitly changed consent during onboarding.',
                  });
                  setProfile((p) => ({
                    ...p,
                    useNameInGreetings: next,
                  }));
                }}
                role="switch"
                aria-checked={profile.useNameInGreetings !== false}
                aria-label={`${t("onboarding.greetingConsent")}: ${t("onboarding.greetingConsentDetail")}`}
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
                  {t("onboarding.learningConsent")}
                </h4>
                <p className="text-xs text-text-muted">
                  {t("onboarding.learningConsentDetail")}
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !profile.letNovaLearn;
                  logAuditAction({
                    userId: profile.fullName || 'anonymous',
                    action: `Toggled consent for personalised_learning to ${next}`,
                    target: 'personalised_learning',
                    status: next ? 'authorised' : 'denied',
                    details: 'User explicitly changed consent during onboarding.',
                  });
                  setProfile((p) => ({ ...p, letNovaLearn: next }));
                }}
                role="switch"
                aria-checked={hasExplicitNovaLearningConsent(profile.letNovaLearn)}
                aria-label={`${t("onboarding.learningConsent")}: ${t("onboarding.learningConsentDetail")}`}
                className={cn(
                  "w-10 h-6 shrink-0 rounded-full transition-colors relative",
                  hasExplicitNovaLearningConsent(profile.letNovaLearn)
                    ? "bg-primary"
                    : "bg-surface dark:bg-surface",
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded-full bg-surface absolute top-1 transition-transform shadow-sm",
                    hasExplicitNovaLearningConsent(profile.letNovaLearn) ? "left-5" : "left-1",
                  )}
                />
              </button>
            </div>

            <div className="flex items-start justify-between p-4 rounded-xl border border-border bg-surface hover:border-text-muted transition-colors">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-text-main">
                  {t("onboarding.remindersConsent")}
                </h4>
                <p className="text-xs text-text-muted">
                  {t("onboarding.remindersConsentDetail")}
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !profile.sendNovaNudges;
                  logAuditAction({
                    userId: profile.fullName || 'anonymous',
                    action: `Toggled consent for gentle_reminders to ${next}`,
                    target: 'gentle_reminders',
                    status: next ? 'authorised' : 'denied',
                    details: 'User explicitly changed consent during onboarding.',
                  });
                  setProfile((p) => ({
                    ...p,
                    sendNovaNudges: next,
                  }));
                }}
                role="switch"
                aria-checked={profile.sendNovaNudges !== false}
                aria-label={`${t("onboarding.remindersConsent")}: ${t("onboarding.remindersConsentDetail")}`}
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
      title: t('onboarding.profileTitle'),
      subtitle: t('onboarding.profileSubtitle'),
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

  const next = async () => {
    if (saving) return;
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      if (!profile.fullName.trim() || !validTimeZone(profile.timeZone || '')) return;
      setSaving(true);
      setSaveError(false);
      try {
        await onComplete(profile);
      } catch {
        // The user stays on this screen with their answers intact.
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    }
  };

  const CurrentIcon = steps[step].icon;

  return (
    <div className="ember-shell ember-sanctuary min-h-screen bg-background flex items-center justify-center p-4 sm:p-8 relative selection:bg-primary/20 selection:text-primary font-sans text-text-main">
      {/* Background aesthetic */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 left-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[160px] pointer-events-none" />
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
            className="ember-feature w-full p-5 sm:p-10 lg:p-14 flex flex-col items-center space-y-7 sm:space-y-10 rounded-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            {/* Onboarding Progress Tracker */}
            <div className="w-full space-y-4 border-b border-white/[0.04] pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary rounded-md border border-primary/25">
                    Step {step + 1} of {steps.length}
                  </span>
                  <span className="text-xs font-bold text-text-muted">
                    One question at a time
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-text-muted">
                  Your pace, your choice
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
                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
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
              <div className="ember-nova-mark w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
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
                          aria-pressed={isSelected}
                          className={cn(
                            "w-full text-left p-6 sm:px-8 rounded-2xl border transition-all duration-300 flex items-center gap-6 group relative overflow-hidden",
                            isSelected
                              ? "bg-primary/10 border-primary/30 text-primary shadow-inner scale-[1.02]"
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
                            {opt.display ?? opt.label}
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
                      aria-label="Full Name / Alias"
                      placeholder="e.g. A. Morgan"
                      value={profile.fullName}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, fullName: e.target.value }))
                      }
                      className="w-full bg-background border border-white/[0.05] focus:border-primary/50 text-text-main placeholder:text-text-muted rounded-xl px-5 py-4 text-sm focus:outline-none transition-all shadow-inner font-sans"
                    />
                  </div>
                  <div className="space-y-3">
                    <label htmlFor="blaze-preferred-name" className="block text-xs font-bold text-text-muted">{t('onboarding.preferredName')}</label>
                    <input id="blaze-preferred-name" type="text" maxLength={60}
                      autoComplete="nickname" value={profile.preferredName || ''}
                      onChange={e => setProfile(p => ({ ...p, preferredName: e.target.value }))}
                      className="w-full bg-background border border-border rounded-xl px-5 py-4 text-text-main"
                      placeholder={t('onboarding.preferredNamePlaceholder')} />
                  </div>
                  <div className="space-y-3">
                    <label htmlFor="blaze-timezone" className="block text-xs font-bold text-text-muted">{t('onboarding.timeZone')}</label>
                    <input id="blaze-timezone" type="text" maxLength={80}
                      value={profile.timeZone || ''} onChange={e => setProfile(p => ({ ...p, timeZone: e.target.value }))}
                      aria-invalid={!validTimeZone(profile.timeZone || '')}
                      aria-describedby={validTimeZone(profile.timeZone || '') ? "blaze-timezone-hint" : "blaze-timezone-hint blaze-timezone-error"}
                      className="w-full bg-background border border-border rounded-xl px-5 py-4 text-text-main"
                      placeholder="Europe/London" />
                    <p id="blaze-timezone-hint" className="text-xs text-text-muted">{t('onboarding.timeZoneHint')}</p>
                    {!validTimeZone(profile.timeZone || '') && (
                      <p id="blaze-timezone-error" role="alert" className="text-xs text-ember-danger">
                        {t('onboarding.timeZoneError')}
                      </p>
                    )}
                  </div>
                  <LanguageSelector
                    id="blaze-language"
                    value={(profile.language as typeof locale) || locale}
                    onChange={(code) => { setLocale(code); setProfile(p => ({ ...p, language: code })); }}
                    className="w-full bg-background border border-border rounded-xl px-5 py-4 text-text-main"
                  />
                  <div className="space-y-3">
                    <label htmlFor="blaze-welcome-tone" className="block text-xs font-bold text-text-muted">{t('onboarding.welcomeStyle')}</label>
                    <select id="blaze-welcome-tone" value={profile.greetingTone || 'warm'}
                      onChange={e => setProfile(p => ({ ...p, greetingTone: e.target.value as 'warm' | 'simple' | 'direct' }))}
                      className="w-full bg-background border border-border rounded-xl px-5 py-4 text-text-main">
                      <option value="warm">{t('settings.tone.warm')}</option><option value="simple">{t('settings.tone.simple')}</option><option value="direct">{t('settings.tone.direct')}</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-black text-text-muted uppercase tracking-widest pl-1">
                      Job Title / Role
                    </p>
                    <input
                      type="text"
                      aria-label="Job Title / Role"
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

            {saveError && (
              <p role="alert" className="w-full mt-5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive p-4 text-sm">
                Your details couldn't be saved. Nothing has been lost from this form. Check your connection and try again.
              </p>
            )}
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
                  saving || (steps[step].id === "profile" && !profile.fullName.trim())
                }
                className={cn(
                  "w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg",
                  (saving || (steps[step].id === "profile" && !profile.fullName.trim()))
                    ? "bg-background border border-white/[0.05] text-text-muted cursor-not-allowed"
                    : "bg-card text-foreground hover:bg-surface shadow-black/5 dark:shadow-white/10 hover:shadow-black/10 dark:hover:shadow-white/20",
                )}
              >
                {saving ? "Saving…" : step === steps.length - 1 ? "Get started" : "Continue"}{" "}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* States which account triggered this screen, in plain text - so
            "why am I seeing onboarding again" is answerable by reading
            this line instead of guessing. Anonymous sessions have no
            email at all (Firebase's own model), which is itself a useful
            signal: it means nobody has actually signed into a real
            account yet in this browser/tab. */}
        <p className="w-full mt-6 text-center text-[11px] text-text-muted">
          {user?.email
            ? `Signed in as ${user.email}`
            : "Signed in anonymously — no account created yet"}
        </p>

        {/* Escape hatch - if this is showing for the wrong account, or
            someone just isn't ready to answer these questions right now,
            they can leave instead of feeling stuck completing a form to
            get out. Same pattern/placement as MfaChallenge.tsx's own
            "Not you? Sign out" link. */}
        <button
          type="button"
          onClick={() => { logOut(); }}
          className="w-full mt-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-main transition-colors py-1"
        >
          <LogOut className="w-3.5 h-3.5" /> Not you? Sign out
        </button>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Activity, Calendar, ChevronDown, Settings } from 'lucide-react';
import { UserProfileData } from '../types.ts';
import { cn } from '../lib/utils.ts';
import { useFeatureFlags, setFeatureFlag, FeatureFlag } from '../lib/feature-flags.ts';
import { logAuditAction } from '../lib/audit-logger.ts';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { AdaptiveFeedbackHistory } from './AdaptiveFeedbackHistory';

// Two toggle mechanisms exist side by side here, deliberately:
// - flagId (localStorage, src/lib/feature-flags.ts) for UI-only display
//   preferences with no server-side effect to gate.
// - permissionKey (Firestore users/{uid}/nova_permissions/current) for
//   anything that actually controls whether real data collection happens
//   server-side - the same doc/mechanism already used by "Nova Privacy
//   Controls" (ConnectedRecoveryModules.tsx). Calendar sync previously used
//   a flagId (enable_calendar_sync) that didn't even exist in the flag
//   schema, so toggling it did nothing at all - not just decorative, an
//   outright no-op consent control.
interface DataPoint {
  id: string;
  label: string;
  category: string;
  description: string;
  novaUsage: string;
  icon: React.ElementType;
  required: boolean;
  flagId?: FeatureFlag;
  permissionKey?: 'allowCalendarSignals';
}

export const DataPrivacyDashboard = ({
  profile,
}: {
  profile: UserProfileData
}) => {
  const flags = useFeatureFlags();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Defaults to true, matching NOVA_PERMISSION_DEFAULTS.allowCalendarSignals
  // (src/lib/nova-brain.ts) until the real doc loads.
  const [allowCalendarSignals, setAllowCalendarSignals] = useState(true);
  const [adaptiveAllowed, setAdaptiveAllowed] = useState(false);
  const [novaMemoryAllowed, setNovaMemoryAllowed] = useState(false);
  const [adaptivePreferred, setAdaptivePreferred] = useState<string[]>([]);
  const [adaptiveAvoided, setAdaptiveAvoided] = useState<string[]>([]);
  const [adaptiveSaving, setAdaptiveSaving] = useState(false);
  const [adaptiveError, setAdaptiveError] = useState('');
  const adaptiveModules = [
    { id: 'guided_reset', label: 'Guided Reset' },
    { id: 'one_less_thing', label: 'One Less Thing' },
    { id: 'capacity_firewall', label: 'Capacity Firewall' },
    { id: 'recovery_fuel', label: 'Recovery Fuel' },
    { id: 'my_patterns', label: 'My Patterns' },
  ];
  const saveAdaptivePreferences = async (changes: {
    allowAdaptiveIntelligence?: boolean;
    adaptivePreferredModules?: string[];
    adaptiveAvoidedModules?: string[];
  }) => {
    const uid = auth.currentUser?.uid;
    if (!uid || adaptiveSaving) return;
    setAdaptiveSaving(true);
    setAdaptiveError('');
    try {
      await setDoc(doc(db, 'users', uid, 'nova_permissions', 'current'), {
        ...changes, updatedAt: new Date().toISOString(),
      }, { merge: true });
      if (typeof changes.allowAdaptiveIntelligence === 'boolean') setAdaptiveAllowed(changes.allowAdaptiveIntelligence);
      if (changes.adaptivePreferredModules) setAdaptivePreferred(changes.adaptivePreferredModules);
      if (changes.adaptiveAvoidedModules) setAdaptiveAvoided(changes.adaptiveAvoidedModules);
    } catch {
      setAdaptiveError('Could not save this preference. Please try again.');
    } finally {
      setAdaptiveSaving(false);
    }
  };


  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid, 'nova_permissions', 'current')).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAdaptiveAllowed(data.allowAdaptiveIntelligence === true);
        setNovaMemoryAllowed(data.allowNovaMemory === true && data.allowNovaUseSavedMemories === true);
        const known = new Set(['guided_reset', 'one_less_thing', 'capacity_firewall', 'recovery_fuel', 'my_patterns']);
        setAdaptivePreferred(Array.isArray(data.adaptivePreferredModules) ? data.adaptivePreferredModules.filter((v: unknown) => typeof v === 'string' && known.has(v)) : []);
        setAdaptiveAvoided(Array.isArray(data.adaptiveAvoidedModules) ? data.adaptiveAvoidedModules.filter((v: unknown) => typeof v === 'string' && known.has(v)) : []);
      }
      if (snap.exists() && typeof snap.data().allowCalendarSignals === 'boolean') {
        setAllowCalendarSignals(snap.data().allowCalendarSignals);
      }
    }).catch(() => {
      // Non-fatal - stays at the true default, same as every other
      // category in this doc when it can't be read.
    });
  }, []);

  const dataPoints: DataPoint[] = [
    {
      id: 'mood',
      label: 'Mood & Somatic Metrics',
      category: 'Core Biological',
      description: 'Records daily energy, mood tags, and somatic (nervous system) flags.',
      novaUsage: 'Nova correlates these drops with your meeting density to detect "Burnout Velocity".',
      icon: Activity,
      required: true,
      flagId: 'enable_mood_pulse' as FeatureFlag
    },
    {
      id: 'calendar',
      label: 'Calendar Sync (Metadata)',
      category: 'Workload Tracking',
      description: 'Accesses meeting counts, durations, and back-to-back blocks (no meeting contents).',
      novaUsage: 'Nova surfaces heavy meeting days and back-to-back stretches so you can spot overload and plan a break around it. It does not predict the future or act on your calendar for you.',
      icon: Calendar,
      required: false,
      permissionKey: 'allowCalendarSignals'
    }
    // A third "Trigger Journal Processing" entry used to be listed here,
    // describing semantic scanning of journal entries for stress keywords.
    // No such processing exists anywhere in this codebase - no journal
    // entry is ever read for keyword/semantic analysis by anything. Removed
    // rather than left describing a capability that was never built.
  ];

  const handleToggle = async (point: DataPoint, e: React.MouseEvent) => {
    e.stopPropagation();
    if (point.required) return;

    if (point.permissionKey) {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const newState = !allowCalendarSignals;
      setAllowCalendarSignals(newState);
      await logAuditAction({
        userId: profile.fullName || 'anonymous',
        action: `Toggled Data Privacy Category: ${point.label}`,
        target: point.id,
        status: newState ? 'authorised' : 'revoked' as any,
        details: `User set ${point.label} sharing to ${newState}`
      });
      try {
        await setDoc(doc(db, 'users', uid, 'nova_permissions', 'current'), {
          [point.permissionKey]: newState,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        setAllowCalendarSignals(!newState); // Revert the optimistic update on a real save failure.
      }
      return;
    }

    if (!point.flagId) return;
    const currentState = flags[point.flagId] ?? true; // assuming default true if undefined
    const newState = !currentState;

    await logAuditAction({
      userId: profile.fullName || 'anonymous',
      action: `Toggled Data Privacy Category: ${point.label}`,
      target: point.id,
      status: newState ? 'authorised' : 'revoked' as any,
      details: `User set ${point.label} sharing to ${newState}`
    });
    
    setFeatureFlag(point.flagId, newState);
  };

  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-primary/10 border border-primary/20 text-primary rounded-xl flex items-center justify-center shrink-0">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-text-main text-lg tracking-tight">Data Privacy Dashboard</h3>
          <p className="text-xs text-text-muted mt-1">Granular controls over how Nova uses your signals.</p>
        </div>
      </div>

      <section className="rounded-xl border border-border p-4 space-y-3" aria-label="Adaptive Intelligence settings">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h4 className="font-semibold text-text-main">Nova Adaptive Intelligence</h4>
            <p className="text-xs text-text-muted mt-1">
              Optional. Use your past feedback to help Nova suggest what suits you.
              Your choices stay private and never override safety or what you ask for.
              This also requires Nova memory to be enabled.
            </p>
          </div>
          <button type="button" role="switch" aria-checked={adaptiveAllowed}
            aria-label="Allow Nova to learn from my feedback"
            disabled={adaptiveSaving || (!adaptiveAllowed && !novaMemoryAllowed)}
            onClick={() => saveAdaptivePreferences({ allowAdaptiveIntelligence: !adaptiveAllowed })}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold border",
              adaptiveAllowed ? "bg-primary text-white border-primary" : "bg-surface text-text-muted border-border")}>
            {adaptiveAllowed ? 'On' : 'Off'}
          </button>
        </div>
        {!novaMemoryAllowed && !adaptiveAllowed && (
          <p className="text-xs text-text-muted">Enable Nova Memory in Privacy Controls first.</p>
        )}
        {adaptiveAllowed && (
          <div className="space-y-2">
            <p className="text-xs text-text-muted">Optional choices. Nova can also learn from your feedback. You can change these anytime.</p>
            {adaptiveModules.map(module => (
              <div key={module.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-text-main">{module.label}</span>
                <div className="flex gap-1">
                  {(['neutral','preferred','avoided'] as const).map(choice => {
                    const selected = choice === 'preferred' ? adaptivePreferred.includes(module.id)
                      : choice === 'avoided' ? adaptiveAvoided.includes(module.id)
                      : !adaptivePreferred.includes(module.id) && !adaptiveAvoided.includes(module.id);
                    return (
                      <button key={choice} type="button" disabled={adaptiveSaving}
                        aria-pressed={selected}
                        className={cn("rounded-md border px-2 py-1", selected ? "border-primary bg-primary/10 text-text-main" : "border-border text-text-muted")}
                        onClick={() => saveAdaptivePreferences({
                          adaptivePreferredModules: [...adaptivePreferred.filter(id => id !== module.id), ...(choice === 'preferred' ? [module.id] : [])],
                          adaptiveAvoidedModules: [...adaptiveAvoided.filter(id => id !== module.id), ...(choice === 'avoided' ? [module.id] : [])],
                        })}>
                        {choice === 'neutral' ? 'No preference' : choice === 'preferred' ? 'More' : 'Less'}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {adaptiveError && <p role="alert" className="text-xs text-red-600">{adaptiveError}</p>}
      </section>

      <AdaptiveFeedbackHistory />

      <div className="space-y-3">
        {dataPoints.map((point) => {
          const isEnabled = point.required
            || (point.permissionKey ? allowCalendarSignals : (point.flagId ? flags[point.flagId] !== false : true));
          const isExpanded = expandedId === point.id;
          
          return (
            <div 
              key={point.id}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return; // Don't react to a bubbled keydown from a nested control like the toggle button.
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpandedId(isExpanded ? null : point.id);
                }
              }}
              className={cn(
                "rounded-xl border transition-all duration-300 overflow-hidden",
                isExpanded 
                  ? "bg-surface border-primary/30 shadow-[0_0_15px_rgba(234,88,12,0.1)]"
                  : "bg-background/40 border-white/[0.04] hover:bg-surface/60 cursor-pointer"
              )}
              onClick={() => setExpandedId(isExpanded ? null : point.id)}
            >
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    isEnabled ? "bg-primary/10 text-primary" : "bg-surface text-text-muted"
                  )}>
                    <point.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className={cn(
                      "text-sm font-bold transition-colors",
                      isEnabled ? "text-text-main" : "text-text-muted"
                    )}>
                      {point.label}
                    </h4>
                    <span className="text-xs font-black uppercase tracking-widest text-text-muted">
                      {point.category}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {point.required && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-widest bg-card text-text-muted border border-border">Required</span>
                  )}
                  {!point.required && (
                    <button 
                      onClick={(e) => handleToggle(point, e)}
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${point.label}`}
                      className={cn(
                        "w-12 h-6 rounded-full flex items-center p-1 transition-colors relative",
                        isEnabled ? "bg-success" : "bg-surface"
                      )}
                    >
                      <span className={cn(
                        "w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm",
                        isEnabled ? "translate-x-6" : "translate-x-0"
                      )} />
                    </button>
                  )}
                  <ChevronDown className={cn(
                    "w-4 h-4 text-text-muted transition-transform duration-300",
                    isExpanded && "rotate-180 text-primary"
                  )} />
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="px-4 pb-4 pt-2 border-t border-white/[0.04] grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs uppercase font-black tracking-widest text-text-muted">What we collect</p>
                        <p className="text-xs text-text-muted leading-relaxed">{point.description}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase font-black tracking-widest text-[#9a3412] dark:text-primary">How Nova uses it</p>
                        <p className="text-xs text-[#9a3412] dark:text-primary-light/70 leading-relaxed font-mono">{point.novaUsage}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};

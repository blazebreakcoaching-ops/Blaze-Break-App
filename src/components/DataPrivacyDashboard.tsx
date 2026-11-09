import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import { Activity, Calendar, ChevronDown, Settings } from 'lucide-react';
import { UserProfileData } from '../types.ts';
import { cn } from '../lib/utils.ts';
import { useFeatureFlags, setFeatureFlag, FeatureFlag } from '../lib/feature-flags.ts';
import { logAuditAction } from '../lib/audit-logger.ts';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { useAuth } from '../lib/auth';
import { saveCalendarSignalConsent } from '../lib/nova-brain';
import { hasExplicitCalendarSignalConsent } from '../lib/calendar-signal-consent';
import { NovaAdaptiveControls } from './NovaAdaptiveControls';
import { useI18n } from '../lib/i18n-react';

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
  const { user } = useAuth();
  const { t } = useI18n();
  const uid = user?.uid ?? null;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allowCalendarSignals, setAllowCalendarSignals] = useState(false);
  const [calendarOwnerSession, setCalendarOwnerSession] = useState<typeof user>(null);
  const [calendarStatus, setCalendarStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarSaveError, setCalendarSaveError] = useState(false);
  const [calendarRetry, setCalendarRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAllowCalendarSignals(false);
    setCalendarOwnerSession(null);
    setCalendarStatus('loading');
    setCalendarSaveError(false);
    setCalendarSaving(false);
    if (!user || !uid || auth.currentUser !== user) {
      setCalendarStatus('error');
      return () => { cancelled = true; };
    }
    getDoc(doc(db, 'users', uid, 'nova_permissions', 'current')).then((snap) => {
      if (cancelled || auth.currentUser !== user) return;
      setAllowCalendarSignals(snap.exists() && hasExplicitCalendarSignalConsent(snap.data()));
      setCalendarOwnerSession(user);
      setCalendarStatus('ready');
    }).catch(() => {
      if (cancelled || auth.currentUser !== user) return;
      // A failed consent read must never look like consent or permit writes.
      setCalendarStatus('error');
    });
    return () => { cancelled = true; };
  }, [user, calendarRetry]);

  const dataPoints: DataPoint[] = [
    {
      id: 'mood',
      label: t('privacy.checkinLabel'),
      category: t('privacy.checkinCategory'),
      description: t('privacy.checkinDescription'),
      novaUsage: t('privacy.checkinUsage'),
      icon: Activity,
      required: true
    },
    {
      id: 'calendar',
      label: t('privacy.calendarLabel'),
      category: t('privacy.calendarCategory'),
      description: t('privacy.calendarDescription'),
      novaUsage: t('privacy.calendarUsage'),
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
      const requestUser = user;
      const requestUid = uid;
      if (!requestUser || !requestUid || auth.currentUser !== requestUser ||
          calendarOwnerSession !== requestUser || calendarStatus !== 'ready' || calendarSaving) return;
      const newState = !allowCalendarSignals;
      setCalendarSaving(true);
      setCalendarSaveError(false);
      try {
        await saveCalendarSignalConsent(requestUid, newState);
        if (auth.currentUser !== requestUser) return;
        setAllowCalendarSignals(newState);
        // Only log consent after Firestore has confirmed the actual change.
        // Audit unavailability must never turn a saved setting into an error.
        void logAuditAction({
          userId: requestUid,
          action: `Changed Calendar signal aggregation to ${newState ? 'on' : 'off'}`,
          target: point.id,
          status: newState ? 'authorised' : 'denied',
          details: 'Explicit Calendar signal aggregation preference saved.',
        }).catch(() => {});
      } catch {
        if (auth.currentUser === requestUser) setCalendarSaveError(true);
      } finally {
        if (auth.currentUser === requestUser) setCalendarSaving(false);
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
          <h3 className="font-bold text-text-main text-lg tracking-tight">{t('privacy.title')}</h3>
          <p className="text-xs text-text-muted mt-1">{t('privacy.subtitle')}</p>
        </div>
      </div>

      {calendarStatus === 'error' && (
        <div role="alert" className="rounded-xl border border-border p-3 text-sm text-text-main">
          {t('privacy.loadError')}
          <button type="button" className="ml-2 underline font-semibold"
            onClick={() => setCalendarRetry(n => n + 1)}>{t('privacy.retry')}</button>
        </div>
      )}
      {calendarSaveError && (
        <p role="alert" className="text-sm text-destructive">{t('privacy.saveError')}</p>
      )}
      <NovaAdaptiveControls />
      <div className="space-y-3">
        {dataPoints.map((point) => {
          const calendarReady = calendarStatus === 'ready' &&
            !!user && calendarOwnerSession === user && auth.currentUser === user;
          const isEnabled = point.required
            || (point.permissionKey ? calendarReady && allowCalendarSignals : (point.flagId ? flags[point.flagId] !== false : true));
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
                    <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-widest bg-card text-text-muted border border-border">{t('privacy.coreLabel')}</span>
                  )}
                  {!point.required && (
                    <button 
                      onClick={(e) => handleToggle(point, e)}
                      role="switch"
                      aria-checked={isEnabled}
                      disabled={!!point.permissionKey && (!calendarReady || calendarSaving)}
                      aria-label={isEnabled ? t('privacy.disable', { item: point.label }) : t('privacy.enable', { item: point.label })}
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
                        <p className="text-xs uppercase font-black tracking-widest text-text-muted">{t('privacy.collectTitle')}</p>
                        <p className="text-xs text-text-muted leading-relaxed">{point.description}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase font-black tracking-widest text-ember-accent">{t('privacy.usageTitle')}</p>
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

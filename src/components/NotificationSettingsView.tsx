import React, { useState, useEffect } from 'react';
import { Shield, Bell, Moon, Clock, Settings, Brain, Activity, Heart, Bookmark, Eye, Apple } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n-react';
import { cn } from '../lib/utils';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firestore';
import { auth } from '../lib/firebase';
import {
  defaultNudgePreferences, isLivePreferenceOwner,
  normaliseNudgePreferences, type NudgePreferences,
} from '../lib/notification-preferences';
export type { NudgePreferences } from '../lib/notification-preferences';

export const NotificationSettingsView = ({ onSaveSuccess }: { onSaveSuccess?: () => void }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<NudgePreferences>(defaultNudgePreferences);
  const [prefsOwnerUid, setPrefsOwnerUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retryNumber, setRetryNumber] = useState(0);
  const [saving, setSaving] = useState(false);

  // Always capture the account UID. An old response must not update a new
  // user's toggles, and a failed read must never authorize default writes.
  useEffect(() => {
    const uid = user?.uid;
    let cancelled = false;
    setPrefs(defaultNudgePreferences());
    setPrefsOwnerUid(null);
    setLoading(true);
    setLoadError(false);
    setSaveError(false);
    setSaved(false);
    setSaving(false);
    if (!uid) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const ref = doc(db, 'users', uid, 'preferences', 'notifications');
        const snap = await getDoc(ref);
        if (!isLivePreferenceOwner(uid, auth.currentUser?.uid ?? null, cancelled)) return;
        setPrefs(normaliseNudgePreferences(snap.exists() ? snap.data() : null));
        setPrefsOwnerUid(uid);
      } catch {
        if (isLivePreferenceOwner(uid, auth.currentUser?.uid ?? null, cancelled)) {
          setLoadError(true);
        }
      } finally {
        if (isLivePreferenceOwner(uid, auth.currentUser?.uid ?? null, cancelled)) {
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid, retryNumber]);

  const handleSave = async () => {
    const uid = user?.uid;
    if (!uid || prefsOwnerUid !== uid || auth.currentUser?.uid !== uid || loading || saving) return;
    setSaving(true);
    setSaveError(false);
    setSaved(false);
    try {
      await setDoc(doc(db, 'users', uid, 'preferences', 'notifications'),
        { ...prefs, updatedAt: new Date().toISOString() }, { merge: true });
      if (auth.currentUser?.uid === uid) {
        setSaved(true);
        onSaveSuccess?.();
      }
    } catch {
      if (auth.currentUser?.uid === uid) setSaveError(true);
    } finally {
      if (auth.currentUser?.uid === uid) setSaving(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setPrefs(p => {
      const cats = p.allowedNudgeCategories.includes(cat)
        ? p.allowedNudgeCategories.filter(c => c !== cat)
        : [...p.allowedNudgeCategories, cat];
      return { ...p, allowedNudgeCategories: cats };
    });
  };

  if (loading) return <div role="status" className="p-4 text-center text-text-muted">Loading your preferences…</div>;
  if (loadError) return (
    <div role="alert" className="p-4 space-y-3 text-text-main">
      <p>We couldn't load your notification preferences. Nothing has been changed.</p>
      <button type="button" className="btn-primary px-4 py-2 rounded-xl" onClick={() => setRetryNumber(n => n + 1)}>Try again</button>
    </div>
  );
  if (!user || prefsOwnerUid !== user.uid || auth.currentUser?.uid !== user.uid) {
    return <div role="status" className="p-4 text-text-muted">Checking your account…</div>;
  }

  return (
    <div className="space-y-6 text-text-main pb-8">
      {saveError && <p role="alert" className="text-xs text-destructive">We couldn't save your changes. Please try again.</p>}
      {saved && <p role="status" className="text-xs text-success">Notification preferences saved.</p>}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-bold flex items-center gap-2 text-text-main">
            <Bell className="w-5 h-5 text-primary" /> {t("notifications.title")}
          </h3>
          <p className="text-xs text-text-muted max-w-sm leading-relaxed">
            {t('notifications.description')}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || prefsOwnerUid !== user.uid}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="p-4 bg-surface dark:bg-card border border-border rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-sm">{t('notifications.enable')}</h4>
            <p className="text-xs text-text-muted">{t('notifications.enableDetail')}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={prefs.notificationsEnabled}
              onChange={e => setPrefs(p => ({ ...p, notificationsEnabled: e.target.checked }))}
              aria-label={t('notifications.enable')}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>

      <div className={cn("space-y-6 transition-opacity", !prefs.notificationsEnabled && "opacity-50 pointer-events-none")}>
        
        {/* Quiet Hours */}
        <div className="p-4 bg-surface dark:bg-card border border-border rounded-xl space-y-4">
          <h4 className="font-bold text-sm flex items-center gap-2"><Moon className="w-4 h-4 text-primary" /> {t("notifications.quietHours")}</h4>
          <p className="text-xs text-text-muted">{t('notifications.quietDetail')}</p>
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <label htmlFor="quiet-hours-start" className="text-[10px] uppercase font-bold text-text-muted">Start</label>
              <input 
                id="quiet-hours-start"
                type="time" 
                value={prefs.quietHoursStart}
                onChange={e => setPrefs(p => ({ ...p, quietHoursStart: e.target.value }))}
                className="bg-background border border-border text-sm p-2 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="quiet-hours-end" className="text-[10px] uppercase font-bold text-text-muted">End</label>
              <input 
                id="quiet-hours-end"
                type="time" 
                value={prefs.quietHoursEnd}
                onChange={e => setPrefs(p => ({ ...p, quietHoursEnd: e.target.value }))}
                className="bg-background border border-border text-sm p-2 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="p-4 bg-surface dark:bg-card border border-border rounded-xl space-y-4">
          <h4 className="font-bold text-sm flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> Allowed Categories</h4>
          <p className="text-xs text-text-muted">Choose what kinds of support you find helpful.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { id: 'check_in_reminder', label: 'Check-ins', icon: Activity, desc: 'Gentle prompts to log your mood.' },
              { id: 'recovery_action_reminder', label: 'Recovery Actions', icon: Heart, desc: 'Small reset reminders.' },
              { id: 'energy_budget_reflection', label: 'Energy Budget', icon: Clock, desc: 'Protecting your capacity.' },
              { id: 'boundary_practice_reminder', label: 'Boundaries', icon: Shield, desc: 'Practising limits.' },
              { id: 'weekly_review_reminder', label: 'Weekly Reviews', icon: Bookmark, desc: 'Reflect on the past week.' },
              { id: 'memory_review_reminder', label: 'Memory Reviews', icon: Brain, desc: 'Review what Nova knows.' },
              { id: 'goal_follow_up', label: 'Goals', icon: Eye, desc: 'Optional gentle follow-ups.' },
              { id: 'fuel_pattern_reminder', label: 'Fuel Patterns', icon: Apple, desc: 'When a real weekly pattern shows up in your fuel log.' }
            ].map(cat => (
              <div key={cat.id} className="flex flex-col gap-1 p-3 border border-border rounded-lg bg-background">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5"><cat.icon className="w-3.5 h-3.5" /> {cat.label}</span>
                  <input 
                    type="checkbox" 
                    checked={prefs.allowedNudgeCategories.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    aria-label={cat.label}
                    className="rounded text-primary border-border focus:ring-0"
                  />
                </div>
                <span className="text-[10px] text-text-muted">{cat.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Frequency */}
        <div className="p-4 bg-surface dark:bg-card border border-border rounded-xl space-y-4">
          <h4 className="font-bold text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Nudge Frequency</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as const).map(freq => (
              <button
                key={freq}
                onClick={() => setPrefs(p => ({ ...p, nudgeFrequency: freq }))}
                aria-pressed={prefs.nudgeFrequency === freq}
                className={cn(
                  "p-2 text-xs font-bold uppercase rounded-lg border text-center transition-colors",
                  prefs.nudgeFrequency === freq ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-text-muted hover:border-primary/50"
                )}
              >
                {freq}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-text-muted text-center italic">
            {prefs.nudgeFrequency === 'low' && "Maximum 1 quiet nudge per day."}
            {prefs.nudgeFrequency === 'medium' && "Up to 2 considerate nudges per day."}
            {prefs.nudgeFrequency === 'high' && "Up to 3 nudges throughout your active hours."}
          </div>
        </div>

      </div>
    </div>
  );
};

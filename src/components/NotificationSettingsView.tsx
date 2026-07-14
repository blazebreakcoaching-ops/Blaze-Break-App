import React, { useState, useEffect } from 'react';
import { Shield, Bell, Moon, Clock, Settings, Brain, Activity, Heart, Bookmark, Eye, Hand } from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface NudgePreferences {
  notificationsEnabled: boolean;
  nudgeFrequency: 'low' | 'medium' | 'high';
  quietHoursStart: string;
  quietHoursEnd: string;
  allowedNudgeCategories: string[];
}

export const NotificationSettingsView = ({ onSaveSuccess }: { onSaveSuccess?: () => void }) => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NudgePreferences>({
    notificationsEnabled: false,
    nudgeFrequency: 'low',
    quietHoursStart: '20:00',
    quietHoursEnd: '08:00',
    allowedNudgeCategories: [
      'check_in_reminder', 'recovery_action_reminder', 'energy_budget_reflection',
      'boundary_practice_reminder', 'weekly_review_reminder', 'memory_review_reminder', 'goal_follow_up'
    ]
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) loadPrefs();
  }, [user]);

  const getPrefsRef = () => doc(db, 'users', user!.uid, 'preferences', 'notifications');

  const loadPrefs = async () => {
    try {
      const snap = await getDoc(getPrefsRef());
      if (snap.exists()) {
        setPrefs(p => ({ ...p, ...snap.data() }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(getPrefsRef(), { ...prefs, updatedAt: new Date().toISOString() }, { merge: true });
      if (onSaveSuccess) onSaveSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
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

  if (loading) return <div className="p-4 text-center text-text-muted">Loading preferences...</div>;

  return (
    <div className="space-y-6 text-text-main pb-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-bold flex items-center gap-2 text-text-main">
            <Bell className="w-5 h-5 text-primary" /> Nova Nudges
          </h3>
          <p className="text-xs text-text-muted max-w-sm leading-relaxed">
            Supportive, quiet reminders. No shame, no pressure, in-app only. Live push, email, SMS, and Guardian remain disabled.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="p-4 bg-surface dark:bg-card border border-border rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-sm">Turn on in-app nudges</h4>
            <p className="text-xs text-text-muted">Allow Nova to offer gentle, contextual support while you use the app.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={prefs.notificationsEnabled}
              onChange={e => setPrefs(p => ({ ...p, notificationsEnabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>

      <div className={cn("space-y-6 transition-opacity", !prefs.notificationsEnabled && "opacity-50 pointer-events-none")}>
        
        {/* Quiet Hours */}
        <div className="p-4 bg-surface dark:bg-card border border-border rounded-xl space-y-4">
          <h4 className="font-bold text-sm flex items-center gap-2"><Moon className="w-4 h-4 text-primary" /> Quiet Hours</h4>
          <p className="text-xs text-text-muted">Nova will never nudge you during these hours.</p>
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-text-muted">Start</label>
              <input 
                type="time" 
                value={prefs.quietHoursStart}
                onChange={e => setPrefs(p => ({ ...p, quietHoursStart: e.target.value }))}
                className="bg-background border border-border text-sm p-2 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-text-muted">End</label>
              <input 
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
              { id: 'goal_follow_up', label: 'Goals', icon: Eye, desc: 'Optional gentle follow-ups.' }
            ].map(cat => (
              <div key={cat.id} className="flex flex-col gap-1 p-3 border border-border rounded-lg bg-background">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5"><cat.icon className="w-3.5 h-3.5" /> {cat.label}</span>
                  <input 
                    type="checkbox" 
                    checked={prefs.allowedNudgeCategories.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
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
          <div className="grid grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as const).map(freq => (
              <button
                key={freq}
                onClick={() => setPrefs(p => ({ ...p, nudgeFrequency: freq }))}
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

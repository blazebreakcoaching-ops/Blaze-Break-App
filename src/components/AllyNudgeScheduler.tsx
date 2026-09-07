import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { secureApiFetch } from '../lib/secure-api';
import {
  BellRing,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  MessageCircle,
  X,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SupportContact } from '../types';

interface NudgeSchedule {
  id: string;
  contactId: string;
  contactName: string;
  contactMethod: string;
  notificationPreference: 'sms' | 'whatsapp';
  message: string;
  frequency: 'daily' | 'weekly';
  daysOfWeek?: number[];
  time: string;
  timezone: string;
  enabled: boolean;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MESSAGE_TEMPLATES = [
  "Hey, just checking in - how's today going?",
  "Quick nudge from Blaze Break: how are you doing today?",
  "No pressure, just thinking of you - how's your day been?",
];

interface AllyNudgeSchedulerProps {
  contacts: SupportContact[];
}

export const AllyNudgeScheduler = ({ contacts }: AllyNudgeSchedulerProps) => {
  const [schedules, setSchedules] = useState<NudgeSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contactId, setContactId] = useState('');
  const [message, setMessage] = useState(MESSAGE_TEMPLATES[0]);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [time, setTime] = useState('09:00');
  const [acknowledged, setAcknowledged] = useState(false);

  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const loadSchedules = async () => {
    try {
      const res = await secureApiFetch('/api/nudge-schedules');
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch (e) {
      // Leaves the honest empty state in place rather than pretending schedules loaded.
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const resetForm = () => {
    setContactId('');
    setMessage(MESSAGE_TEMPLATES[0]);
    setFrequency('daily');
    setDaysOfWeek([1, 2, 3, 4, 5]);
    setTime('09:00');
    setAcknowledged(false);
    setError(null);
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  };

  const handleSubmit = async () => {
    setError(null);
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) {
      setError('Pick who this should go to.');
      return;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(contact.contactMethod)) {
      setError("This contact's number isn't in a valid format - edit it in Guardian Protection Network first.");
      return;
    }
    if (!message.trim()) {
      setError('Write a message, or pick one of the suggestions.');
      return;
    }
    if (frequency === 'weekly' && daysOfWeek.length === 0) {
      setError('Pick at least one day for a weekly schedule.');
      return;
    }
    if (!acknowledged) {
      setError("Please confirm you've told them to expect these messages.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await secureApiFetch('/api/nudge-schedules', {
        method: 'POST',
        data: {
          contactId: contact.id,
          contactName: contact.name,
          contactMethod: contact.contactMethod,
          notificationPreference: contact.notificationPreference || 'sms',
          message: message.trim(),
          frequency,
          daysOfWeek: frequency === 'weekly' ? daysOfWeek : undefined,
          time,
          timezone: detectedTimezone,
          enabled: true,
          contactAcknowledged: true,
        },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Could not save that schedule.');
      }
      await loadSchedules();
      resetForm();
      setIsAdding(false);
    } catch (e: any) {
      setError(e.message || 'Something went wrong saving that.');
    }
    setSubmitting(false);
  };

  const handleToggle = async (schedule: NudgeSchedule) => {
    setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, enabled: !s.enabled } : s));
    try {
      await secureApiFetch(`/api/nudge-schedules/${schedule.id}`, {
        method: 'PATCH',
        data: { enabled: !schedule.enabled },
      });
    } catch (e) {
      // Revert on failure so the UI never lies about what's actually saved.
      setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, enabled: schedule.enabled } : s));
    }
  };

  const handleDelete = async (id: string) => {
    const prior = schedules;
    setSchedules(prev => prev.filter(s => s.id !== id));
    try {
      await secureApiFetch(`/api/nudge-schedules/${id}`, { method: 'DELETE' });
    } catch (e) {
      setSchedules(prior);
    }
  };

  const describeSchedule = (s: NudgeSchedule) => {
    if (s.frequency === 'daily') return `Every day at ${s.time}`;
    const days = (s.daysOfWeek || []).map(d => DAY_LABELS[d]).join(', ');
    return `${days || 'No days set'} at ${s.time}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-main">Accountability Nudges</h3>
            <p className="text-xs text-text-muted mt-0.5">Recurring check-in messages to someone you choose. You set the schedule - nothing here decides on its own when to send.</p>
          </div>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" /> New Schedule
          </button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 bg-surface/50 border border-border rounded-2xl space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-text-muted">New Schedule</span>
                <button onClick={() => { setIsAdding(false); resetForm(); }} aria-label="Cancel new schedule" className="text-text-muted hover:text-text-main cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {contacts.length === 0 ? (
                <p className="text-sm text-text-muted italic">Add a contact in Guardian Protection Network first, then come back here to schedule nudges to them.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Send to</label>
                    <select
                      value={contactId}
                      onChange={e => setContactId(e.target.value)}
                      className="w-full bg-white dark:bg-surface border border-border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary"
                    >
                      <option value="">Choose a contact...</option>
                      {contacts.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.relation || c.role.replace('_', ' ')})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Message</label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      maxLength={300}
                      rows={2}
                      className="w-full bg-white dark:bg-surface border border-border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary resize-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      {MESSAGE_TEMPLATES.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => setMessage(t)}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-surface border border-border/60 text-text-muted hover:text-text-main hover:border-border cursor-pointer transition-colors"
                        >
                          Use suggestion {i + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Frequency</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setFrequency('daily')}
                          aria-pressed={frequency === 'daily'}
                          className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all", frequency === 'daily' ? 'bg-primary text-primary-foreground' : 'bg-white dark:bg-surface border border-border text-text-muted')}
                        >
                          Daily
                        </button>
                        <button
                          onClick={() => setFrequency('weekly')}
                          aria-pressed={frequency === 'weekly'}
                          className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all", frequency === 'weekly' ? 'bg-primary text-primary-foreground' : 'bg-white dark:bg-surface border border-border text-text-muted')}
                        >
                          Specific days
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Time</label>
                      <input
                        type="time"
                        value={time}
                        onChange={e => setTime(e.target.value)}
                        className="w-full bg-white dark:bg-surface border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {frequency === 'weekly' && (
                    <div className="flex gap-1.5 flex-wrap">
                      {DAY_LABELS.map((label, i) => (
                        <button
                          key={i}
                          onClick={() => toggleDay(i)}
                          aria-pressed={daysOfWeek.includes(i)}
                          className={cn("w-10 h-10 rounded-xl text-[11px] font-bold cursor-pointer transition-all", daysOfWeek.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-white dark:bg-surface border border-border text-text-muted')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-text-muted ml-1">Times use your current timezone ({detectedTimezone}).</p>

                  <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-border/40">
                    <div className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border-2 transition-all", acknowledged ? "bg-primary border-primary" : "bg-white dark:bg-surface border-border")}>
                      {acknowledged && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                    </div>
                    <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="hidden" />
                    <span className="text-xs text-text-muted leading-relaxed">I've told this contact to expect these messages and they're okay receiving them.</span>
                  </label>

                  {error && (
                    <div role="alert" className="flex items-start gap-2 text-xs text-destructive dark:text-[#f87171] bg-destructive/10 p-3 rounded-xl">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                    {submitting ? 'Saving...' : 'Save Schedule'}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      ) : schedules.length === 0 && !isAdding ? (
        <p className="text-sm text-text-muted italic text-center py-6">No nudge schedules set up yet.</p>
      ) : (
        <div className="space-y-3">
          {schedules.map(s => (
            <div key={s.id} className="flex items-center justify-between p-4 rounded-2xl bg-surface/50 border border-border/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", s.enabled ? 'bg-primary/10 text-primary' : 'bg-surface text-text-muted')}>
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text-main truncate">{s.contactName}</p>
                  <p className="text-xs text-text-muted truncate">{describeSchedule(s)} · "{s.message}"</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  onClick={() => handleToggle(s)}
                  role="switch"
                  aria-checked={s.enabled}
                  aria-label={`${s.enabled ? 'Disable' : 'Enable'} nudge schedule for ${s.contactName}`}
                  className={cn("w-11 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors", s.enabled ? "bg-success" : "bg-border")}
                >
                  <span className={cn("w-4 h-4 rounded-full bg-white transition-transform", s.enabled ? "translate-x-5" : "translate-x-0")} />
                </button>
                <button onClick={() => handleDelete(s.id)} aria-label={`Delete nudge schedule for ${s.contactName}`} className="text-text-muted hover:text-destructive cursor-pointer p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

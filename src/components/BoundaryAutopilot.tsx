import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Moon, MessageCircle, CalendarX, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { secureApiFetch } from '../lib/secure-api';
import { fetchUpcomingEvents, declineCalendarEvent, UpcomingEvent } from '../lib/boundary-autopilot';

type ActionTab = 'message' | 'dnd' | 'status' | 'calendar';

interface SlackMember {
  id: string;
  name: string;
  avatar?: string;
}

// Every action here is real and consequential — the UI pattern throughout is
// deliberately "draft, then a separate explicit confirm step", never a single
// click that both drafts and executes. Boundary Autopilot's whole value is
// trustworthy action on someone's behalf; a UI that makes it easy to
// accidentally send something would undermine exactly that trust.
export const BoundaryAutopilot = () => {
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<ActionTab>('message');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Message tab state
  const [members, setMembers] = useState<SlackMember[]>([]);
  const [recipientId, setRecipientId] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(false);

  // DND tab state
  const [dndMinutes, setDndMinutes] = useState(60);

  // Status tab state
  const [statusText, setStatusText] = useState('In deep work — back soon');
  const [statusEmoji, setStatusEmoji] = useState(':no_entry:');

  // Calendar tab state
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'message' && members.length === 0) {
      secureApiFetch('/api/boundary-autopilot/slack/users')
        .then((res) => res.json())
        .then((data) => setMembers(data.members || []))
        .catch(() => {});
    }
    if (activeTab === 'calendar' && accessToken && events.length === 0) {
      setEventsLoading(true);
      fetchUpcomingEvents(accessToken)
        .then(setEvents)
        .catch(() => {})
        .finally(() => setEventsLoading(false));
    }
  }, [activeTab, accessToken]);

  const runAction = async (fn: () => Promise<void>, successMessage: string) => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      await fn();
      setStatus({ type: 'success', message: successMessage });
      setPendingConfirm(false);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Something went wrong.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendMessage = () => runAction(async () => {
    const res = await secureApiFetch('/api/boundary-autopilot/slack/send', {
      method: 'POST',
      data: { recipientId, message: messageDraft, confirm: true },
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setMessageDraft('');
  }, 'Message sent.');

  const setDnd = () => runAction(async () => {
    const res = await secureApiFetch('/api/boundary-autopilot/slack/dnd', {
      method: 'POST',
      data: { minutes: dndMinutes, confirm: true },
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  }, `Do Not Disturb set for ${dndMinutes} minutes.`);

  const setSlackStatus = () => runAction(async () => {
    const res = await secureApiFetch('/api/boundary-autopilot/slack/status', {
      method: 'POST',
      data: { statusText, statusEmoji, confirm: true },
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  }, 'Slack status updated.');

  const declineMeeting = () => runAction(async () => {
    if (!accessToken) throw new Error('Connect Google Calendar first.');
    await declineCalendarEvent(accessToken, selectedEventId);
    setEvents((prev) => prev.filter((e) => e.id !== selectedEventId));
    setSelectedEventId('');
  }, 'Meeting declined.');

  const tabs: { id: ActionTab; label: string; icon: any }[] = [
    { id: 'message', label: 'Send Message', icon: Send },
    { id: 'dnd', label: 'Do Not Disturb', icon: Moon },
    { id: 'status', label: 'Status', icon: MessageCircle },
    { id: 'calendar', label: 'Decline Meeting', icon: CalendarX },
  ];

  return (
    <div className="card bg-card border border-border p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-text-main">Boundary Autopilot</h3>
        <p className="text-xs text-text-muted mt-1">
          Real actions on your connected accounts — nothing sends until you explicitly confirm it below.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); setStatus(null); setPendingConfirm(false); }}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors shrink-0",
              activeTab === t.id ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface"
            )}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {activeTab === 'message' && (
            <div className="space-y-3">
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="w-full p-3 rounded-xl border border-border bg-surface text-sm text-text-main"
              >
                <option value="">Choose who to message...</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <textarea
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                placeholder="Draft your boundary message..."
                rows={4}
                className="w-full p-3 rounded-xl border border-border bg-surface text-sm text-text-main resize-none"
              />
              {!pendingConfirm ? (
                <button
                  disabled={!recipientId || !messageDraft.trim()}
                  onClick={() => setPendingConfirm(true)}
                  className="w-full btn-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Review before sending
                </button>
              ) : (
                <ConfirmBar
                  isSubmitting={isSubmitting}
                  label={`Send this message to ${members.find((m) => m.id === recipientId)?.name}?`}
                  onConfirm={sendMessage}
                  onCancel={() => setPendingConfirm(false)}
                />
              )}
            </div>
          )}

          {activeTab === 'dnd' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {[30, 60, 120, 240].map((m) => (
                  <button
                    key={m}
                    onClick={() => setDndMinutes(m)}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-bold border transition-colors",
                      dndMinutes === m ? "bg-primary/10 border-primary text-primary" : "border-border text-text-muted hover:bg-surface"
                    )}
                  >
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
              </div>
              {!pendingConfirm ? (
                <button
                  onClick={() => setPendingConfirm(true)}
                  className="w-full btn-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest"
                >
                  Review before setting
                </button>
              ) : (
                <ConfirmBar
                  isSubmitting={isSubmitting}
                  label={`Set Do Not Disturb for ${dndMinutes} minutes?`}
                  onConfirm={setDnd}
                  onCancel={() => setPendingConfirm(false)}
                />
              )}
            </div>
          )}

          {activeTab === 'status' && (
            <div className="space-y-3">
              <input
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="Status text"
                maxLength={100}
                className="w-full p-3 rounded-xl border border-border bg-surface text-sm text-text-main"
              />
              {!pendingConfirm ? (
                <button
                  disabled={!statusText.trim()}
                  onClick={() => setPendingConfirm(true)}
                  className="w-full btn-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Review before updating
                </button>
              ) : (
                <ConfirmBar
                  isSubmitting={isSubmitting}
                  label={`Set your Slack status to "${statusText}"?`}
                  onConfirm={setSlackStatus}
                  onCancel={() => setPendingConfirm(false)}
                />
              )}
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="space-y-3">
              {!accessToken ? (
                <p className="text-xs text-text-muted">Connect Google Workspace in Settings to see upcoming meetings.</p>
              ) : eventsLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              ) : events.length === 0 ? (
                <p className="text-xs text-text-muted">No meetings in the next 7 days with you as an invitee.</p>
              ) : (
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-surface text-sm text-text-main"
                >
                  <option value="">Choose a meeting to decline...</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.summary} — {new Date(ev.start).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                    </option>
                  ))}
                </select>
              )}
              {selectedEventId && !pendingConfirm && (
                <button
                  onClick={() => setPendingConfirm(true)}
                  className="w-full btn-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest"
                >
                  Review before declining
                </button>
              )}
              {selectedEventId && pendingConfirm && (
                <ConfirmBar
                  isSubmitting={isSubmitting}
                  label={`Decline "${events.find((e) => e.id === selectedEventId)?.summary}" and notify attendees?`}
                  onConfirm={declineMeeting}
                  onCancel={() => setPendingConfirm(false)}
                />
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {status && (
        <div className={cn(
          "p-3 rounded-xl text-xs font-medium flex items-start gap-2",
          status.type === 'success' ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
        )}>
          {status.type === 'success' ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
};

const ConfirmBar = ({ label, onConfirm, onCancel, isSubmitting }: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) => (
  <div className="p-4 rounded-xl border border-warning/30 bg-warning/5 space-y-3">
    <p className="text-sm font-bold text-text-main">{label}</p>
    <div className="flex gap-2">
      <button
        onClick={onCancel}
        disabled={isSubmitting}
        className="flex-1 py-2.5 rounded-lg bg-surface text-text-muted text-xs font-bold hover:bg-border transition-colors flex items-center justify-center gap-2"
      >
        <X className="w-3.5 h-3.5" /> Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={isSubmitting}
        className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {isSubmitting ? 'Sending...' : 'Confirm'}
      </button>
    </div>
  </div>
);

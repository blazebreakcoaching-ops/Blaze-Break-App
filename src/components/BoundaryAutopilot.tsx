import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Moon, MessageCircle, CalendarX, Check, X, AlertTriangle, Loader2, History, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { auth } from '../lib/firebase';
import { secureApiFetch } from '../lib/secure-api';
import { fetchUpcomingEvents, declineCalendarEvent, UpcomingEvent } from '../lib/boundary-autopilot';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { loadStressors } from '../lib/energy-delta-service';
import { Stressor } from '../../energy-delta-engine';
import {
  AFTERCARE_LINE, AFTERCARE_RESPONSE_ORDER, AFTERCARE_RESPONSE_LABELS, AftercareResponse,
  BOUNDARY_OUTCOME_QUESTION, BOUNDARY_OUTCOME_ORDER, BOUNDARY_OUTCOME_LABELS, BoundaryOutcome,
  FEARED_OUTCOME_ORDER, FEARED_OUTCOME_LABELS, FearedOutcome, WHAT_DO_YOU_EXPECT_QUESTION,
  buildEvidenceBaseResult, EvidencePair,
  EVIDENCE_BASE_FOLLOWUP_QUESTION, EVIDENCE_BASE_FOLLOWUP_ORDER, EVIDENCE_BASE_FOLLOWUP_LABELS, EvidenceBaseFollowupAnswer,
} from '../../boundary-outcome-engine';
import {
  recordBoundaryAction, updateBoundaryOutcomeRecord, loadRecentBoundaryOutcomes, applyCapacityProtectedIfEarned,
  BoundaryOutcomeRecord,
} from '../lib/boundary-outcome-service';

interface BoundaryAutopilotProps {
  onNavigate?: (tab: string) => void;
}

type ActionTab = 'message' | 'dnd' | 'status' | 'calendar' | 'history';

interface SlackMember {
  id: string;
  name: string;
  avatar?: string;
}

interface AutopilotAction {
  id: string;
  action: 'slack_send' | 'slack_dnd' | 'slack_status' | 'calendar_decline' | 'sms_send';
  detail: Record<string, any>;
  success: boolean;
  takenAt: string;
}

// Every action here is real and consequential — the UI pattern throughout is
// deliberately "draft, then a separate explicit confirm step", never a single
// click that both drafts and executes. Boundary Autopilot's whole value is
// trustworthy action on someone's behalf; a UI that makes it easy to
// accidentally send something would undermine exactly that trust.
export const BoundaryAutopilot = ({ onNavigate }: BoundaryAutopilotProps) => {
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<ActionTab>('message');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // INTEGRATION TRUTHFULNESS: live execution controls for Slack-backed
  // actions (message/DND/status) only ever render once we've confirmed
  // Slack is actually connected - null while checking, false shows a
  // plain "connect it in Settings" notice instead of simulating
  // functionality that isn't really there.
  const [slackConnected, setSlackConnected] = useState<boolean | null>(null);

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

  // History tab state
  const [historyActions, setHistoryActions] = useState<AutopilotAction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // BOUNDARY AFTERCARE / OUTCOME: "What do you expect will happen?" is
  // captured once, before confirming - optional, never forced.
  const [fearedOutcome, setFearedOutcome] = useState<FearedOutcome | null>(null);
  // The just-taken action's own outcome record - aftercare is offered
  // right after a real action, not auto-reassuring, and never scored.
  const [currentRecord, setCurrentRecord] = useState<BoundaryOutcomeRecord | null>(null);
  const [aftercareAnswered, setAftercareAnswered] = useState<AftercareResponse | null>(null);
  const [capacityStressors, setCapacityStressors] = useState<Stressor[]>([]);
  const [selectedStressorId, setSelectedStressorId] = useState('');
  const [capacityLinked, setCapacityLinked] = useState(false);

  // History tab: the sparse, pull-based "How did it go?" follow-up, and
  // the Personal Evidence Base built only from the user's own confirmed
  // feared-vs-actual pairs.
  const [outcomeHistory, setOutcomeHistory] = useState<BoundaryOutcomeRecord[]>([]);
  const [outcomeChoiceDraft, setOutcomeChoiceDraft] = useState<BoundaryOutcome | null>(null);
  const [evidenceFollowup, setEvidenceFollowup] = useState<EvidenceBaseFollowupAnswer | null>(null);

  // Checked once, regardless of which tab is active, so message/DND/status
  // never show as live-and-ready before we actually know Slack is connected.
  useEffect(() => {
    secureApiFetch('/api/boundary-autopilot/slack/users')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || data.error) { setSlackConnected(false); return; }
        setSlackConnected(true);
        setMembers(data.members || []);
      })
      .catch(() => setSlackConnected(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'calendar' && accessToken && events.length === 0) {
      setEventsLoading(true);
      fetchUpcomingEvents(accessToken)
        .then(setEvents)
        .catch(() => {})
        .finally(() => setEventsLoading(false));
    }
    if (activeTab === 'history') {
      setHistoryLoading(true);
      secureApiFetch('/api/boundary-autopilot/history')
        .then((res) => res.json())
        .then((data) => { setHistoryActions(data.actions || []); setHistoryLoaded(true); })
        .catch(() => {})
        .finally(() => setHistoryLoading(false));
      if (auth.currentUser) {
        loadRecentBoundaryOutcomes(auth.currentUser.uid).then(setOutcomeHistory);
      }
    }
  }, [activeTab, accessToken, events.length]);

  // The single most recent action still waiting on a real "how did it
  // go?" - calendar declines never need one (the decline itself already
  // is the confirmed reduction). Sparse by construction: only ever one
  // banner, never a backlog, and never prompts repeated checking.
  const pendingOutcomeRecord = outcomeHistory.find((r) => r.outcome === null && r.sourceAction !== 'calendar_decline') ?? null;

  const evidencePairs: EvidencePair[] = outcomeHistory
    .filter((r) => r.fearedOutcome && r.outcome)
    .map((r) => ({ feared: r.fearedOutcome as FearedOutcome, outcome: r.outcome as BoundaryOutcome }));
  const evidenceResult = buildEvidenceBaseResult(evidencePairs);

  const runAction = async (fn: () => Promise<void>, successMessage: string, sourceAction: BoundaryOutcomeRecord['sourceAction']) => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      await fn();
      setStatus({ type: 'success', message: successMessage });
      setPendingConfirm(false);
      // successMessage is already a clean, human-readable summary (e.g.
      // "Message sent.") - it never contains the actual message/status
      // text, so this can't leak drafted content into Nova's memory.
      updateNovaMemoryBySourceAndType('Boundary Autopilot', 'rule', {
        content: `Boundary action taken: ${successMessage} (${new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}).`,
        confidence: 'verified',
        canEdit: false,
      });
      setAftercareAnswered(null);
      setCapacityLinked(false);
      setCurrentRecord(null);
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        const id = await recordBoundaryAction(uid, { sourceAction, requestSource: null, fearedOutcome });
        setCurrentRecord({
          id, sourceAction, requestSource: null, fearedOutcome,
          aftercareResponse: null, waitingChoice: null, outcome: null,
          capacityProtectedApplied: false, linkedStressorId: null, createdAt: new Date().toISOString(),
        });
        if (sourceAction === 'calendar_decline') {
          const stressors = await loadStressors(uid);
          setCapacityStressors(stressors.filter((s) => s.status === 'active'));
        }
      }
      setFearedOutcome(null);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Something went wrong.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendMessage = () => runAction(async () => {
    const recipientName = members.find((m) => m.id === recipientId)?.name;
    const res = await secureApiFetch('/api/boundary-autopilot/slack/send', {
      method: 'POST',
      data: { recipientId, recipientName, message: messageDraft, confirm: true },
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setMessageDraft('');
  }, 'Message sent.', 'slack_send');

  const setDnd = () => runAction(async () => {
    const res = await secureApiFetch('/api/boundary-autopilot/slack/dnd', {
      method: 'POST',
      data: { minutes: dndMinutes, confirm: true },
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  }, `Do Not Disturb set for ${dndMinutes} minutes.`, 'slack_dnd');

  const setSlackStatus = () => runAction(async () => {
    const res = await secureApiFetch('/api/boundary-autopilot/slack/status', {
      method: 'POST',
      data: { statusText, statusEmoji, confirm: true },
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  }, 'Slack status updated.', 'slack_status');

  const declineMeeting = () => runAction(async () => {
    if (!accessToken) throw new Error('Connect Google Calendar first.');
    const declinedEvent = events.find((e) => e.id === selectedEventId);
    await declineCalendarEvent(accessToken, selectedEventId);
    setEvents((prev) => prev.filter((e) => e.id !== selectedEventId));
    setSelectedEventId('');
    secureApiFetch('/api/boundary-autopilot/log-calendar-decline', {
      method: 'POST',
      data: { eventSummary: declinedEvent?.summary || 'Untitled meeting' },
    }).catch(() => {
      // The decline itself already succeeded — a logging failure shouldn't surface as an error to the user.
    });
  }, 'Meeting declined.', 'calendar_decline');

  const answerAftercare = async (response: AftercareResponse) => {
    setAftercareAnswered(response);
    if (auth.currentUser && currentRecord) {
      await updateBoundaryOutcomeRecord(auth.currentUser.uid, currentRecord.id, { aftercareResponse: response });
    }
    if (response === 'talk_to_nova') onNavigate?.('nova');
  };

  const linkCapacityProtected = async () => {
    if (!auth.currentUser || !currentRecord || !selectedStressorId) return;
    const applied = await applyCapacityProtectedIfEarned(auth.currentUser.uid, currentRecord, selectedStressorId);
    if (applied) setCapacityLinked(true);
  };

  const submitPendingOutcome = async () => {
    if (!auth.currentUser || !pendingOutcomeRecord || !outcomeChoiceDraft) return;
    await updateBoundaryOutcomeRecord(auth.currentUser.uid, pendingOutcomeRecord.id, { outcome: outcomeChoiceDraft });
    setOutcomeHistory((prev) => prev.map((r) => (r.id === pendingOutcomeRecord.id ? { ...r, outcome: outcomeChoiceDraft } : r)));
    setOutcomeChoiceDraft(null);
  };

  const tabs: { id: ActionTab; label: string; icon: any }[] = [
    { id: 'message', label: 'Send Message', icon: Send },
    { id: 'dnd', label: 'Do Not Disturb', icon: Moon },
    { id: 'status', label: 'Status', icon: MessageCircle },
    { id: 'calendar', label: 'Decline Meeting', icon: CalendarX },
    { id: 'history', label: 'History', icon: History },
  ];

  const expectedOutcomePicker = (
    <div className="space-y-2">
      <p className="text-xs font-bold text-text-muted">{WHAT_DO_YOU_EXPECT_QUESTION}</p>
      <div className="flex flex-wrap gap-2">
        {FEARED_OUTCOME_ORDER.map((f) => (
          <button
            key={f}
            onClick={() => setFearedOutcome(f)}
            aria-pressed={fearedOutcome === f}
            className={cn("px-3 py-1.5 rounded-lg border text-xs font-bold", fearedOutcome === f ? "border-primary bg-primary/10 text-[#9a3412] dark:text-primary" : "border-border text-text-muted hover:border-primary/40")}
          >
            {FEARED_OUTCOME_LABELS[f]}
          </button>
        ))}
      </div>
    </div>
  );

  const aftercareAndCapacityPanel = currentRecord && (
    <div className="space-y-3">
      {!aftercareAnswered ? (
        <div className="p-4 rounded-xl border border-border bg-surface/60 space-y-3">
          <p className="text-sm font-bold text-text-main">{AFTERCARE_LINE}</p>
          <div className="flex flex-wrap gap-2">
            {AFTERCARE_RESPONSE_ORDER.map((r) => (
              <button key={r} onClick={() => answerAftercare(r)} className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/40">
                {AFTERCARE_RESPONSE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {currentRecord.sourceAction === 'calendar_decline' && !capacityLinked && capacityStressors.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-surface/60 space-y-2">
          <p className="text-xs font-bold text-text-muted flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Did this remove something from your logged load?</p>
          <select
            value={selectedStressorId}
            onChange={(e) => setSelectedStressorId(e.target.value)}
            aria-label="Choose the stressor this resolved"
            className="w-full p-2.5 rounded-lg border border-border bg-surface text-xs text-text-main"
          >
            <option value="">Not tracked as a stressor...</option>
            {capacityStressors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {selectedStressorId && (
            <button onClick={linkCapacityProtected} className="text-xs font-bold text-[#9a3412] dark:text-primary hover:opacity-80">
              Update Capacity Protected
            </button>
          )}
        </div>
      )}
      {capacityLinked && (
        <p className="text-xs font-bold text-success dark:text-[#4ade80] flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Capacity Protected updated.</p>
      )}
    </div>
  );

  return (
    <div className="card bg-card border border-border p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-text-main">Boundary Autopilot</h3>
        <p className="text-xs text-text-muted mt-1">
          Real actions on your connected accounts — nothing sends until you explicitly confirm it below.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => { setActiveTab(t.id); setStatus(null); setPendingConfirm(false); }}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors shrink-0",
              activeTab === t.id ? "bg-primary/10 text-[#9a3412] dark:text-primary" : "text-text-muted hover:bg-surface"
            )}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {activeTab === 'message' && slackConnected === false && <SlackNotConnectedNotice action="send messages" />}
          {activeTab === 'message' && slackConnected === null && <Loader2 className="w-5 h-5 animate-spin text-text-muted" />}
          {activeTab === 'message' && slackConnected === true && (
            <div className="space-y-3">
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                aria-label="Choose who to message"
                className="w-full p-3 rounded-xl border border-border bg-surface text-sm text-text-main"
              >
                <option value="">Choose who to message...</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <textarea
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                aria-label="Boundary message draft"
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
                <>
                  {expectedOutcomePicker}
                  <ConfirmBar
                    isSubmitting={isSubmitting}
                    label={`Send this message to ${members.find((m) => m.id === recipientId)?.name}?`}
                    onConfirm={sendMessage}
                    onCancel={() => setPendingConfirm(false)}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === 'dnd' && slackConnected === false && <SlackNotConnectedNotice action="set Do Not Disturb" />}
          {activeTab === 'dnd' && slackConnected === null && <Loader2 className="w-5 h-5 animate-spin text-text-muted" />}
          {activeTab === 'dnd' && slackConnected === true && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {[30, 60, 120, 240].map((m) => (
                  <button
                    key={m}
                    onClick={() => setDndMinutes(m)}
                    aria-pressed={dndMinutes === m}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-bold border transition-colors",
                      dndMinutes === m ? "bg-primary/10 border-primary text-[#9a3412] dark:text-primary" : "border-border text-text-muted hover:bg-surface"
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
                <>
                  {expectedOutcomePicker}
                  <ConfirmBar
                    isSubmitting={isSubmitting}
                    label={`Set Do Not Disturb for ${dndMinutes} minutes?`}
                    onConfirm={setDnd}
                    onCancel={() => setPendingConfirm(false)}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === 'status' && slackConnected === false && <SlackNotConnectedNotice action="update your Slack status" />}
          {activeTab === 'status' && slackConnected === null && <Loader2 className="w-5 h-5 animate-spin text-text-muted" />}
          {activeTab === 'status' && slackConnected === true && (
            <div className="space-y-3">
              <input
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                aria-label="Status text"
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
                <>
                  {expectedOutcomePicker}
                  <ConfirmBar
                    isSubmitting={isSubmitting}
                    label={`Set your Slack status to "${statusText}"?`}
                    onConfirm={setSlackStatus}
                    onCancel={() => setPendingConfirm(false)}
                  />
                </>
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
                  aria-label="Choose a meeting to decline"
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
                <>
                  {expectedOutcomePicker}
                  <ConfirmBar
                    isSubmitting={isSubmitting}
                    label={`Decline "${events.find((e) => e.id === selectedEventId)?.summary}" and notify attendees?`}
                    onConfirm={declineMeeting}
                    onCancel={() => setPendingConfirm(false)}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              {pendingOutcomeRecord && (
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3 mb-2">
                  <p className="text-sm font-bold text-text-main">{BOUNDARY_OUTCOME_QUESTION}</p>
                  <div className="flex flex-wrap gap-2">
                    {BOUNDARY_OUTCOME_ORDER.map((o) => (
                      <button
                        key={o}
                        onClick={() => setOutcomeChoiceDraft(o)}
                        aria-pressed={outcomeChoiceDraft === o}
                        className={cn("px-3 py-1.5 rounded-lg border text-xs font-bold", outcomeChoiceDraft === o ? "border-primary bg-primary/10 text-text-main" : "border-border text-text-muted hover:border-primary/40")}
                      >
                        {BOUNDARY_OUTCOME_LABELS[o]}
                      </button>
                    ))}
                  </div>
                  {outcomeChoiceDraft && (
                    <button onClick={submitPendingOutcome} className="text-xs font-bold text-[#9a3412] dark:text-primary hover:opacity-80">Save</button>
                  )}
                </div>
              )}
              {evidenceResult.available && evidenceResult.line && (
                <div className="p-4 rounded-xl border border-border bg-surface/60 space-y-3 mb-2">
                  <p className="text-sm text-text-main">{evidenceResult.line}</p>
                  {!evidenceFollowup ? (
                    <>
                      <p className="text-xs font-bold text-text-muted">{EVIDENCE_BASE_FOLLOWUP_QUESTION}</p>
                      <div className="flex flex-wrap gap-2">
                        {EVIDENCE_BASE_FOLLOWUP_ORDER.map((a) => (
                          <button key={a} onClick={() => setEvidenceFollowup(a)} className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/40">
                            {EVIDENCE_BASE_FOLLOWUP_LABELS[a]}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-text-muted">Noted.</p>
                  )}
                </div>
              )}
              {historyLoading ? (
                <div className="flex items-center gap-2 text-text-muted text-xs py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading history...
                </div>
              ) : historyActions.length === 0 ? (
                <p className="text-xs text-text-muted py-4">
                  Nothing here yet — every real action Boundary Autopilot takes on your behalf will show up here.
                </p>
              ) : (
                historyActions.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "p-3 rounded-xl border text-xs flex items-start gap-3",
                      a.success ? "border-border bg-surface" : "border-destructive/20 bg-destructive/5"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {a.success ? <Check className="w-4 h-4 text-success dark:text-[#4ade80]" /> : <AlertTriangle className="w-4 h-4 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text-main font-medium">{describeAutopilotAction(a)}</p>
                      <p className="text-text-muted text-[10px] mt-1">
                        {new Date(a.takenAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {status && (
        <div role="status" aria-live="polite" className={cn(
          "p-3 rounded-xl text-xs font-medium flex items-start gap-2",
          status.type === 'success' ? "bg-success/10 text-success dark:text-[#4ade80]" : "bg-destructive/10 text-destructive dark:text-[#f87171]"
        )}>
          {status.type === 'success' ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{status.message}</span>
        </div>
      )}

      {aftercareAndCapacityPanel}
    </div>
  );
};

const describeAutopilotAction = (a: AutopilotAction): string => {
  const { action, detail, success } = a;
  if (!success) {
    if (action === 'slack_send') return `Failed to send a message${detail.recipientName ? ` to ${detail.recipientName}` : ''}.`;
    if (action === 'slack_dnd') return `Failed to set Do Not Disturb${detail.minutes ? ` for ${detail.minutes} minutes` : ''}.`;
    if (action === 'slack_status') return `Failed to update your Slack status.`;
    if (action === 'calendar_decline') return `Failed to decline a meeting.`;
    if (action === 'sms_send') return `Failed to send a text message.`;
    return 'An action failed.';
  }
  switch (action) {
    case 'slack_send':
      return `Sent a message to ${detail.recipientName || 'a Slack contact'}${detail.message ? `: "${String(detail.message).slice(0, 60)}${detail.message.length > 60 ? '…' : ''}"` : ''}`;
    case 'slack_dnd':
      return `Set Do Not Disturb for ${detail.minutes} minutes.`;
    case 'slack_status':
      return `Updated your Slack status to "${detail.statusText}".`;
    case 'calendar_decline':
      return `Declined "${detail.eventSummary || 'a meeting'}".`;
    case 'sms_send':
      return `Sent a text message${detail.to ? ` to ${detail.to}` : ''}.`;
    default:
      return 'Action completed.';
  }
};

// INTEGRATION TRUTHFULNESS: shown instead of simulating a live control
// when Slack genuinely isn't connected - draft-only/copy equivalents live
// on the Script Library and Boundary Compiler, not here.
const SlackNotConnectedNotice = ({ action }: { action: string }) => (
  <p className="text-xs text-text-muted py-4">Connect Slack in Settings to {action}.</p>
);

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

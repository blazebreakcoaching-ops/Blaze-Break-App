import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, MessageSquare, Power, AlertTriangle, ShieldCheck, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { CommunicationGrid, CommunicationGridColumn } from './layout/CommunicationGrid';
import { auth } from '../lib/firebase';
import { BurnoutFingerprint } from '../types';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import {
  BOUNDARY_PROFILE_ORDER, BOUNDARY_PROFILE_LABELS, BoundaryProfileId,
  BOUNDARY_ACTION_ORDER, BOUNDARY_ACTION_LABELS, BOUNDARY_ACTION_KIND, BoundaryActionId,
  DEFAULT_PROFILE_ACTIONS, shouldOfferDoorwayCrossing, DOORWAY_CROSSING_LINE,
  URGENT_OR_LOUD_QUESTIONS, URGENCY_CLASSIFICATION_ORDER, URGENCY_CLASSIFICATION_LABELS,
  URGENCY_CLASSIFICATION_GUIDANCE, URGENT_OR_LOUD_SUMMARY_QUESTION, UrgencyClassification,
} from '../../digital-boundary-shield-engine';
import {
  saveBoundaryProfile, loadBoundaryProfile, recordUrgentOrLoudAssessment,
} from '../lib/digital-boundary-shield-service';

interface DigitalBoundaryShieldProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
}

// Honest routing for actions this app genuinely CAN do, just not from this
// screen - Boundary Autopilot's real Slack status/DND, and Decompression
// Doorway's unfinished-business capture and crossing ritual. Never
// simulated locally.
const ACTION_ROUTE: Record<BoundaryActionId, { tab: string; label: string; viaDoorway?: boolean } | null> = {
  park_unfinished_work: { tab: 'reset', label: 'Open Decompression Doorway', viaDoorway: true },
  update_work_status: { tab: 'communicate', label: 'Open Boundary Autopilot' },
  mute_work_notifications: { tab: 'communicate', label: 'Open Boundary Autopilot' },
  start_doorway: { tab: 'reset', label: 'Open Decompression Doorway', viaDoorway: true },
  close_work_tabs: null,
  close_email: null,
  close_laptop: null,
};

export const DigitalBoundaryShield = ({ fingerprint, onAwardPoints, onNavigate }: DigitalBoundaryShieldProps) => {
  const [profileId, setProfileId] = useState<BoundaryProfileId | null>(null);
  const [profileActions, setProfileActions] = useState<BoundaryActionId[]>([]);
  const [checklistDone, setChecklistDone] = useState<Partial<Record<BoundaryActionId, boolean>>>({});
  const [activated, setActivated] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [urgentLoudStep, setUrgentLoudStep] = useState<'input' | 'questions' | 'classify' | 'result'>('input');
  const [urgentLoudMessage, setUrgentLoudMessage] = useState('');
  const [urgentLoudAnswers, setUrgentLoudAnswers] = useState<Record<string, string>>({});
  const [urgencyClassification, setUrgencyClassification] = useState<UrgencyClassification | null>(null);

  const openProfile = async (id: BoundaryProfileId) => {
    setProfileId(id);
    setActivated(false);
    setChecklistDone({});
    setLoadingProfile(true);
    let actions = DEFAULT_PROFILE_ACTIONS[id];
    if (auth.currentUser) {
      const saved = await loadBoundaryProfile(auth.currentUser.uid, id);
      if (saved) actions = saved.actions;
    }
    setProfileActions(actions);
    setLoadingProfile(false);
  };

  const toggleProfileAction = (action: BoundaryActionId) => {
    setProfileActions((prev) => (prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]));
  };

  const routeToRealTool = (action: BoundaryActionId) => {
    const route = ACTION_ROUTE[action];
    if (!route) return;
    if (route.viaDoorway) {
      window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'reset' }));
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('show_more_reset_tools')), 80);
    } else {
      onNavigate?.(route.tab);
    }
    setChecklistDone((prev) => ({ ...prev, [action]: true }));
  };

  const activateProfile = async () => {
    if (!profileId) return;
    setActivated(true);
    if (auth.currentUser) {
      await saveBoundaryProfile(auth.currentUser.uid, profileId, profileActions);
    }
    updateNovaMemoryBySourceAndType('Digital Boundary Shield', 'state', {
      content: `Activated the "${BOUNDARY_PROFILE_LABELS[profileId]}" boundary profile.`,
      confidence: 'verified',
      canEdit: true,
    });
    if (onAwardPoints) onAwardPoints(10, `Activated ${BOUNDARY_PROFILE_LABELS[profileId]}`);
  };

  const crossTheDoorway = () => {
    window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'reset' }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('show_more_reset_tools')), 80);
  };

  const answerUrgentLoudQuestion = (id: string, value: string) => {
    setUrgentLoudAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const chooseClassification = async (c: UrgencyClassification) => {
    setUrgencyClassification(c);
    setUrgentLoudStep('result');
    if (auth.currentUser) {
      await recordUrgentOrLoudAssessment(auth.currentUser.uid, {
        message: urgentLoudMessage, answers: urgentLoudAnswers, classification: c,
      });
    }
    updateNovaMemoryBySourceAndType('Digital Boundary Shield', 'state', {
      content: `Last "Urgent or Loud?" assessment: "${URGENCY_CLASSIFICATION_LABELS[c]}".`,
      confidence: 'verified',
      canEdit: true,
    });
  };

  const resetUrgentLoud = () => {
    setUrgentLoudStep('input');
    setUrgentLoudMessage('');
    setUrgentLoudAnswers({});
    setUrgencyClassification(null);
  };

  const allActionsHandled = profileActions.length > 0 && profileActions.every((a) => checklistDone[a]);
  const showDoorwayCrossing = profileId ? shouldOfferDoorwayCrossing(profileId, profileActions) : false;
  const RESPONSE_TEMPLATE = "Received. I am currently focused on another priority but will review this and respond by [a specific time].";

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 14 / Digital Defences</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Digital Boundary Shield</h3>
            <p className="text-xl text-text-muted font-medium max-w-2xl">Make the boundary real.</p>
          </div>
        </div>
      </div>

      <CommunicationGrid columns="lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">

        <CommunicationGridColumn>
          {/* Urgent or Loud? - guided, never a one-line pronouncement */}
          <div className="card border border-primary/20 bg-primary/5 p-8 relative overflow-hidden">
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-text-main tracking-tight">Urgent or Loud?</h3>
                  <p className="text-[11px] uppercase tracking-[0.2em] font-black text-[#9a3412] dark:text-primary">Urgency Check</p>
                </div>
              </div>

              {urgentLoudStep === 'input' && (
                <div className="space-y-4">
                  <p className="text-xl font-display font-bold text-text-main">
                    "Is this actually urgent, or did someone else's panic just walk into your nervous system?"
                  </p>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      aria-label="Message or request to assess"
                      value={urgentLoudMessage}
                      onChange={(e) => setUrgentLoudMessage(e.target.value)}
                      placeholder="Paste the message or describe the request..."
                      className="flex-1 bg-surface dark:bg-surface/50 border border-border/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-text-main"
                    />
                    <button
                      onClick={() => setUrgentLoudStep('questions')}
                      disabled={!urgentLoudMessage.trim()}
                      className="btn-primary whitespace-nowrap disabled:opacity-40"
                    >
                      Think It Through
                    </button>
                  </div>
                </div>
              )}

              {urgentLoudStep === 'questions' && (
                <div className="space-y-4">
                  {URGENT_OR_LOUD_QUESTIONS.map((q) => (
                    <label key={q.id} className="block space-y-1.5">
                      <span className="text-sm font-bold text-text-main">{q.text}</span>
                      <input
                        value={urgentLoudAnswers[q.id] || ''}
                        onChange={(e) => answerUrgentLoudQuestion(q.id, e.target.value)}
                        placeholder="(optional)"
                        className="w-full bg-surface dark:bg-surface/50 border border-border/50 rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                      />
                    </label>
                  ))}
                  <button onClick={() => setUrgentLoudStep('classify')} className="btn-primary">Continue</button>
                </div>
              )}

              {urgentLoudStep === 'classify' && (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-text-main">{URGENT_OR_LOUD_SUMMARY_QUESTION}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {URGENCY_CLASSIFICATION_ORDER.map((c) => (
                      <button
                        key={c}
                        onClick={() => chooseClassification(c)}
                        className="text-left text-sm rounded-xl border border-border px-4 py-3 text-text-main hover:border-primary/40 transition-colors bg-surface/60"
                      >
                        {URGENCY_CLASSIFICATION_LABELS[c]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence>
                {urgentLoudStep === 'result' && urgencyClassification && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-6 rounded-2xl border border-border bg-surface flex gap-4">
                      <AlertTriangle className="w-6 h-6 shrink-0 text-primary" />
                      <div>
                        <h4 className="font-bold text-lg mb-1 text-text-main">{URGENCY_CLASSIFICATION_LABELS[urgencyClassification]}</h4>
                        <p className="text-sm font-medium text-text-muted">{URGENCY_CLASSIFICATION_GUIDANCE[urgencyClassification]}</p>
                      </div>
                    </div>
                    {(urgencyClassification === 'someone_elses_urgency' || urgencyClassification === 'can_wait') && (
                      <div className="p-4 rounded-xl border border-border bg-surface/60 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">A holding response, if useful</p>
                        <p className="text-sm text-text-main italic">"{RESPONSE_TEMPLATE}"</p>
                        <button
                          onClick={() => navigator.clipboard?.writeText(RESPONSE_TEMPLATE)}
                          className="text-xs font-bold text-[#9a3412] dark:text-primary hover:opacity-80"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    <button onClick={resetUrgentLoud} className="text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-main">
                      Assess something else
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Boundary Profiles */}
          <div className="card border border-border p-8">
            <div className="flex items-center gap-3 mb-2">
              <Power className="w-5 h-5 text-success" />
              <h3 className="text-2xl font-display font-bold text-text-main">Boundary Profiles</h3>
            </div>
            <p className="text-text-muted mb-6">Reusable, configurable - choose what actually applies, nothing is forced.</p>

            <div className="flex flex-wrap gap-2 mb-6">
              {BOUNDARY_PROFILE_ORDER.map((p) => (
                <button
                  key={p}
                  onClick={() => openProfile(p)}
                  aria-pressed={profileId === p}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold border transition-colors",
                    profileId === p ? "bg-primary/10 border-primary text-[#9a3412] dark:text-primary" : "border-border text-text-muted hover:bg-surface"
                  )}
                >
                  {BOUNDARY_PROFILE_LABELS[p]}
                </button>
              ))}
            </div>

            {profileId && (
              loadingProfile ? (
                <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              ) : (
                <div className="space-y-3">
                  {BOUNDARY_ACTION_ORDER.map((action) => {
                    const included = profileActions.includes(action);
                    const kind = BOUNDARY_ACTION_KIND[action];
                    const route = ACTION_ROUTE[action];
                    return (
                      <div
                        key={action}
                        className={cn(
                          "flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors",
                          included ? "border-border bg-surface/60" : "border-border/40 opacity-50"
                        )}
                      >
                        <label className="flex items-center gap-3 text-sm text-text-main cursor-pointer flex-1">
                          <input type="checkbox" checked={included} onChange={() => toggleProfileAction(action)} />
                          {BOUNDARY_ACTION_LABELS[action]}
                        </label>
                        {included && kind === 'self_checklist' && (
                          <button
                            onClick={() => setChecklistDone((prev) => ({ ...prev, [action]: !prev[action] }))}
                            aria-pressed={!!checklistDone[action]}
                            className={cn("shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border", checklistDone[action] ? "border-success/30 bg-success/10 text-success dark:text-[#4ade80]" : "border-border text-text-muted")}
                          >
                            {checklistDone[action] ? <CheckCircle2 className="w-3.5 h-3.5" /> : "I've done this"}
                          </button>
                        )}
                        {included && kind === 'routes_to_real_tool' && route && (
                          <button
                            onClick={() => routeToRealTool(action)}
                            className="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-primary/30 text-[#9a3412] dark:text-primary hover:bg-primary/10 flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3 h-3" /> {route.label}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {!activated ? (
                    <button
                      onClick={activateProfile}
                      disabled={profileActions.length === 0}
                      className="w-full btn-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-40"
                    >
                      Activate {BOUNDARY_PROFILE_LABELS[profileId]}
                    </button>
                  ) : (
                    <div className="p-4 rounded-xl border border-success/20 bg-success/5 space-y-3">
                      <p className="text-sm font-bold text-success dark:text-[#4ade80] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> {BOUNDARY_PROFILE_LABELS[profileId]} activated{allActionsHandled ? '' : ' — work through the actions above whenever you\'re ready'}.
                      </p>
                      {showDoorwayCrossing && (
                        <div className="space-y-2">
                          <p className="text-sm text-text-main">{DOORWAY_CROSSING_LINE}</p>
                          <button onClick={crossTheDoorway} className="btn-primary py-2.5 px-5 text-xs">Cross the Doorway</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </CommunicationGridColumn>

        <CommunicationGridColumn>
          <div className="card border border-border p-6 bg-surface dark:bg-surface/50">
             <div className="flex items-center gap-2 mb-2">
               <MessageSquare className="w-4 h-4 text-text-muted" />
               <span className="text-xs font-black uppercase tracking-widest text-text-muted">Response Template</span>
             </div>
             <p className="text-sm font-medium text-text-main italic mb-3">"{RESPONSE_TEMPLATE}"</p>
             <button
               onClick={() => navigator.clipboard?.writeText(RESPONSE_TEMPLATE)}
               className="text-xs font-bold text-[#9a3412] dark:text-primary hover:opacity-80 transition-opacity flex items-center gap-1.5"
             >
               Copy Template
             </button>
          </div>

          <div className="card border border-border p-6 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-text-muted" />
              <span className="text-xs font-black uppercase tracking-widest text-text-muted">Honest by design</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Blaze Break can't mute Slack, Teams, WhatsApp or email on its own. Where a real action exists (Slack status, Do Not Disturb), it routes to Boundary Autopilot. Everything else here is a checklist you confirm for yourself.
            </p>
          </div>
        </CommunicationGridColumn>
      </CommunicationGrid>
    </div>
  );
};

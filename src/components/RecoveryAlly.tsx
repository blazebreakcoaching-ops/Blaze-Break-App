import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartPulse, CheckSquare, Target, Mail, Award, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, Activity, Brain, Clock, Plus, ArrowRight, Zap, Loader2, Copy, Eye, X, Check, MessageCircle, HeartHandshake, Clock3, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { logJourney } from '../lib/nova-brain';
import { secureApiFetch } from '../lib/secure-api';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc, orderBy, query, limit } from 'firebase/firestore';
import { effectiveConsentStatus, isInviteExpired, computeInviteExpiresAt, ConsentStatus } from '../../recovery-ally-consent';
import {
  SupportCapsuleCategory,
  SUPPORT_CAPSULE_CATEGORIES,
  SUPPORT_CAPSULE_CATEGORY_LABELS,
  computeCapsuleExpiresAt,
  deriveEffectiveSharing,
} from '../../support-capsules';

interface PreviewData {
  allyName: string;
  sharedGoals?: { id: string; text: string; category: string; completedToday: boolean; streak: number }[];
  longestStreak?: number;
  recentAvgMood?: number | null;
  supportPreferences?: { helps: string; doesNotHelp: string };
}

interface SharedGoal {
  id: string;
  text: string;
  category: string;
  completedDates: string[];
}

interface Encouragement {
  id: string;
  type: 'system' | 'personal';
  message: string;
  createdAt: string;
}

type AllyPermissions = Record<SupportCapsuleCategory, boolean>;

const DEFAULT_PERMISSIONS: AllyPermissions = { viewGoals: true, viewMilestones: true, sendPings: true, viewEnergyStats: false };

// Same logic as the server's computeStreak - counts consecutive completed
// days ending today or yesterday, so a streak isn't broken just because
// today hasn't happened yet.
const computeStreak = (completedDates: string[]): number => {
  if (!completedDates || completedDates.length === 0) return 0;
  const dateSet = new Set(completedDates);
  const today = new Date();
  let streak = 0;
  const cursor = new Date(today);
  const todayStr = today.toISOString().split('T')[0];
  if (!dateSet.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dateSet.has(cursor.toISOString().split('T')[0])) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export const RecoveryAlly = () => {
  const [loading, setLoading] = useState(true);
  const [isInvited, setIsInvited] = useState(false);
  const [allyName, setAllyName] = useState('');
  const [allyEmail, setAllyEmail] = useState('');
  const [shareToken, setShareToken] = useState('');
  // Mandatory Ally Consent + magic-link hardening (Master Support Circle
  // spec): the owner's own read of where this invite actually stands.
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>('accepted');
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [permissions, setPermissionsState] = useState<AllyPermissions>(DEFAULT_PERMISSIONS);
  const [sharedGoals, setSharedGoals] = useState<SharedGoal[]>([]);
  const [encouragements, setEncouragements] = useState<Encouragement[]>([]);

  const [emailDraft, setEmailDraft] = useState('');
  const [inviting, setInviting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState('');
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [newGoalText, setNewGoalText] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // Sharing Preview (Master Support Circle spec): a checkbox never commits
  // immediately - it stages a pending change and shows exactly what will
  // and won't be visible as a result, requiring an explicit Confirm before
  // the real capsule write happens.
  const [pendingToggle, setPendingToggle] = useState<{ category: SupportCapsuleCategory; nextOn: boolean } | null>(null);
  const [confirmingToggle, setConfirmingToggle] = useState(false);

  // Preview Their View (Master Support Circle spec): the owner's own real
  // current data, rendered exactly as the ally's page would show it -
  // fetched on demand, never pre-filled with example data.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // "How to Support Me" (Master Support Circle spec): a short,
  // user-authored, skippable note - never shown to the ally unless
  // visibleToAlly is explicitly turned on.
  const [supportHelps, setSupportHelps] = useState('');
  const [supportDoesNotHelp, setSupportDoesNotHelp] = useState('');
  const [supportVisibleToAlly, setSupportVisibleToAlly] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(false);

  const fetchGoals = async () => {
    if (!auth.currentUser) return;
    const snap = await getDocs(query(collection(db, 'users', auth.currentUser.uid, 'ally_shared_goals'), orderBy('createdAt', 'desc')));
    setSharedGoals(snap.docs.map(d => ({ id: d.id, ...d.data() } as SharedGoal)));
  };

  const fetchEncouragements = async () => {
    if (!auth.currentUser) return;
    const snap = await getDocs(query(collection(db, 'users', auth.currentUser.uid, 'ally_encouragements'), orderBy('createdAt', 'desc'), limit(30)));
    setEncouragements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Encouragement)));
  };

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setLoading(false); return; }
      const uid = auth.currentUser.uid;
      try {
        const stateSnap = await getDoc(doc(db, 'users', uid, 'recovery_ally', 'state'));
        if (stateSnap.exists()) {
          const data = stateSnap.data();
          setIsInvited(!!data.isInvited);
          setAllyName(data.allyName || '');
          setAllyEmail(data.allyEmail || '');
          setShareToken(data.shareToken || '');
          setConsentStatus(effectiveConsentStatus(data.consentStatus));
          setInviteExpiresAt(data.inviteExpiresAt || null);
          setSupportHelps(data.supportHelps || '');
          setSupportDoesNotHelp(data.supportDoesNotHelp || '');
          setSupportVisibleToAlly(!!data.supportVisibleToAlly);

          if (data.isInvited) {
            const capsulesSnap = await getDocs(collection(db, 'users', uid, 'support_capsules'));
            let capsules = capsulesSnap.docs.map((d) => d.data() as { category: SupportCapsuleCategory; expiresAt: string | null });

            // One-time lazy migration for a relationship that predates
            // Support Capsules: write real capsules for whatever the old
            // blanket object had on, so this user's sharing is backed by
            // the real model from here on (see support-capsules.ts's
            // MIGRATION NOTE) instead of permanently relying on a fallback.
            if (capsules.length === 0 && data.permissions) {
              const now = new Date().toISOString();
              const toCreate = SUPPORT_CAPSULE_CATEGORIES.filter((cat) => data.permissions[cat] === true);
              await Promise.all(toCreate.map((category) => setDoc(doc(db, 'users', uid, 'support_capsules', category), {
                category,
                expiryType: 'until_off',
                startAt: now,
                expiresAt: computeCapsuleExpiresAt('until_off', now),
                createdAt: now,
                updatedAt: now,
              })));
              capsules = toCreate.map((category) => ({ category, expiresAt: null }));
            }

            setPermissionsState(deriveEffectiveSharing(capsules, new Date().toISOString(), data.permissions || {}) as AllyPermissions);
            await fetchGoals();
            await fetchEncouragements();
          }
        }
      } catch (e) {
        setError('Could not load your Recovery Ally settings.');
      }
      setLoading(false);
    };
    load();
  }, []);

  // The real, immediate write - only ever called after the owner has seen
  // the Sharing Preview below and explicitly confirmed (see confirmToggle).
  // 'until_off' is the only expiry this checkbox-based UI offers for now
  // (a real expiry-type picker is a later PR in this series); the
  // underlying model already supports more, so that UI can land without
  // another schema change.
  const commitCapsuleToggle = async (category: SupportCapsuleCategory, nextOn: boolean) => {
    setPermissionsState((prev) => ({ ...prev, [category]: nextOn }));
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    try {
      if (nextOn) {
        const now = new Date().toISOString();
        await setDoc(doc(db, 'users', uid, 'support_capsules', category), {
          category,
          expiryType: 'until_off',
          startAt: now,
          expiresAt: computeCapsuleExpiresAt('until_off', now),
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await deleteDoc(doc(db, 'users', uid, 'support_capsules', category));
      }
    } catch (e) {
      // Non-fatal - the toggle still reflects locally even if the save fails;
      // it'll revert to the last-saved value next time this loads.
    }
  };

  // Stages a checkbox change for the Sharing Preview below instead of
  // writing anything yet.
  const requestCapsuleToggle = (category: SupportCapsuleCategory, nextOn: boolean) => {
    setPendingToggle({ category, nextOn });
  };

  const confirmPendingToggle = async () => {
    if (!pendingToggle) return;
    setConfirmingToggle(true);
    await commitCapsuleToggle(pendingToggle.category, pendingToggle.nextOn);
    setConfirmingToggle(false);
    setPendingToggle(null);
  };

  const cancelPendingToggle = () => setPendingToggle(null);

  // What the ally would see if the pending change were confirmed right
  // now - the "exactly what will/won't be visible" the spec asks for.
  const previewedSharing: AllyPermissions = pendingToggle
    ? { ...permissions, [pendingToggle.category]: pendingToggle.nextOn }
    : permissions;

  const fetchPreview = async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const res = await secureApiFetch('/api/ally/preview');
      const json = await res.json();
      if (!res.ok) {
        setPreviewError(json.error || "Couldn't load the preview.");
      } else {
        setPreviewData(json);
      }
    } catch (e) {
      setPreviewError("Couldn't load the preview.");
    }
    setPreviewLoading(false);
  };

  // Writing the note and sharing it are separate acts - saving always
  // persists helps/doesNotHelp regardless of the toggle, but they only
  // ever reach buildAllyViewResponse (and therefore the ally's real page)
  // when supportVisibleToAlly is true.
  const savePreferences = async () => {
    if (!auth.currentUser) return;
    setSavingPreferences(true);
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'recovery_ally', 'state'), {
        supportHelps: supportHelps.trim(),
        supportDoesNotHelp: supportDoesNotHelp.trim(),
        supportVisibleToAlly,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setPreferencesSaved(true);
      setTimeout(() => setPreferencesSaved(false), 2500);
    } catch (e) {
      setError('Could not save your support preferences.');
    }
    setSavingPreferences(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailDraft.trim()) return;
    setInviting(true);
    setError('');
    try {
      const res = await secureApiFetch('/api/ally/invite', {
        method: 'POST',
        data: { allyEmail: emailDraft.trim() },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send that invite.');
      } else {
        setIsInvited(true);
        setAllyEmail(emailDraft.trim().toLowerCase());
        setAllyName(emailDraft.split('@')[0]);
        setShareToken(data.shareToken || '');
        setConsentStatus('pending');
        setInviteExpiresAt(computeInviteExpiresAt(new Date().toISOString()));
        setPermissionsState(DEFAULT_PERMISSIONS);
        setEmailDraft('');
        if (!data.emailSent) {
          setError("Invite created, but the email couldn't be sent - copy the link below and share it directly.");
        }
        await fetchGoals();
      }
    } catch (e) {
      setError('Could not send that invite.');
    }
    setInviting(false);
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await secureApiFetch('/api/ally/revoke', { method: 'POST' });
      setIsInvited(false);
      setAllyEmail('');
      setAllyName('');
      setShareToken('');
      setConsentStatus('accepted');
      setInviteExpiresAt(null);
      setEncouragements([]);
    } catch (e) {
      setError('Could not remove your ally. Please try again.');
    }
    setRevoking(false);
  };

  // Magic-link hardening (Master Support Circle spec): "immediate revoke
  // and regenerate if compromised" - issues a brand new token and resets
  // consent to pending. The old link stops working the instant this
  // succeeds (the server looks tokens up by exact value).
  const regenerateLink = async () => {
    setRegenerating(true);
    setError('');
    try {
      const res = await secureApiFetch('/api/ally/regenerate-link', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not generate a new link.');
      } else {
        setShareToken(data.shareToken || '');
        setConsentStatus('pending');
        setInviteExpiresAt(computeInviteExpiresAt(new Date().toISOString()));
        setLinkCopied(false);
      }
    } catch (e) {
      setError('Could not generate a new link.');
    }
    setRegenerating(false);
  };

  const toggleGoalToday = async (goal: SharedGoal) => {
    if (!auth.currentUser) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const wasCompleted = goal.completedDates.includes(todayStr);
    const nextDates = wasCompleted
      ? goal.completedDates.filter(d => d !== todayStr)
      : [...goal.completedDates, todayStr];

    setSharedGoals(prev => prev.map(g => g.id === goal.id ? { ...g, completedDates: nextDates } : g));
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'ally_shared_goals', goal.id), {
        completedDates: nextDates,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      if (!wasCompleted) {
        // Only the act of completing counts as real engagement - toggling
        // it back off isn't "activity" worth marking fresh.
        secureApiFetch('/api/user/mark-activity', {
          method: 'POST',
          data: { activity: 'recoveryAllyActivity' },
        }).catch(() => {
          // Non-fatal - only affects the home recommendation engine's freshness.
        });
      }
    } catch (e) {
      await fetchGoals(); // Reconcile with what's actually saved if the write failed.
    }
  };

  const addNewGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim() || !auth.currentUser) return;
    const text = newGoalText.trim();
    setNewGoalText('');
    setIsAddingGoal(false);
    try {
      const ref = await addDoc(collection(db, 'users', auth.currentUser.uid, 'ally_shared_goals'), {
        text, category: 'custom', completedDates: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      setSharedGoals(prev => [{ id: ref.id, text, category: 'custom', completedDates: [] }, ...prev]);
      logJourney(`Set a boundary goal shared with Recovery Ally`, text);
    } catch (e) {
      setError('Could not save that goal.');
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (!auth.currentUser) return;
    setSharedGoals(prev => prev.filter(g => g.id !== goalId));
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'ally_shared_goals', goalId));
    } catch (e) {
      await fetchGoals();
    }
  };

  const shareLink = shareToken ? `${window.location.origin}/ally/${shareToken}` : '';
  const inviteExpired = isInviteExpired(inviteExpiresAt, consentStatus, new Date().toISOString());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-xl bg-card border border-border p-8">
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-medium text-text-main tracking-tight">Recovery Ally</h2>
              <p className="text-primary/70 text-xs font-medium uppercase tracking-widest mt-1">Someone in your corner</p>
            </div>
          </div>
          <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-2xl">
            Invite a trusted friend, mentor, or partner to check in on your recovery — you choose exactly what they can see, and you can turn any of it off at any time. They don't need their own account.
          </p>
          <div className="bg-surface border border-destructive/20 p-4 rounded-lg flex gap-3 text-xs text-text-muted max-w-lg">
            <AlertTriangle className="w-5 h-5 text-destructive/80 dark:text-[#f87171] shrink-0" />
            <div>
              <strong className="text-destructive dark:text-[#f87171]">This isn't for crises.</strong> It's for everyday accountability. If you're in crisis or need immediate support, use <em className="text-text-muted">Guardian Relay</em> instead.
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl max-w-2xl">{error}</div>
      )}

      {!isInvited ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card max-w-2xl p-8 bg-white dark:bg-card border border-border">
          <div className="flex items-start gap-4 mb-8">
            <div className="w-10 h-10 rounded-full bg-surface dark:bg-surface flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-text-muted" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main mb-1">Invite Your Ally</h3>
              <p className="text-xs text-text-muted leading-relaxed">A real email goes out with a private link. They'll see what you choose to share and can leave you a note — no sign-up required.</p>
            </div>
          </div>

          <form onSubmit={handleInvite} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="recovery-ally-email" className="text-xs font-medium uppercase tracking-widest text-text-muted ml-1">Their Email</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted group-focus-within:text-primary transition-colors" />
                <input
                  id="recovery-ally-email"
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-surface dark:bg-surface border border-border focus:border-primary focus:ring-primary/20 text-text-main placeholder:text-text-muted rounded-lg pl-12 pr-4 py-4 font-mono text-sm focus:outline-none focus:ring-2 transition-all"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-primary text-primary-foreground hover:opacity-90 rounded-lg text-xs font-medium uppercase tracking-widest transition-all group disabled:opacity-50"
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Send Invite <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Active Status & Permissions */}
          <div className="lg:col-span-4 space-y-6">
            <div className="card space-y-6 border border-primary/20 bg-white dark:bg-card">
              <div className="flex items-center gap-4 border-b border-border pb-6">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-surface dark:bg-surface text-text-muted flex items-center justify-center font-bold text-xl uppercase border-2 border-primary/30">
                    {allyName.charAt(0)}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success border-2 border-surface dark:border-surface rounded-full" />
                </div>
                <div>
                  <h3 className="font-bold text-text-main text-lg tracking-tight">{allyName}</h3>
                  {consentStatus === 'accepted' ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase font-medium tracking-widest text-success dark:text-[#4ade80] mt-1">
                      <CheckCircle2 className="w-3 h-3" /> Accepted
                    </span>
                  ) : consentStatus === 'declined' ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase font-medium tracking-widest text-text-muted mt-1">
                      <X className="w-3 h-3" /> Said They Can't Take This On
                    </span>
                  ) : inviteExpired ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase font-medium tracking-widest text-text-muted mt-1">
                      <Clock3 className="w-3 h-3" /> Invitation Expired
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase font-medium tracking-widest text-warning mt-1">
                      <Clock3 className="w-3 h-3" /> Waiting for Them to Respond
                    </span>
                  )}
                </div>
              </div>

              {(consentStatus === 'declined' || inviteExpired) && (
                <div className="p-3 bg-surface rounded-lg border border-border space-y-2">
                  <p className="text-xs text-text-muted leading-relaxed">
                    {consentStatus === 'declined'
                      ? "They've let you know they can't take this on right now."
                      : "This invitation window has closed - nothing was ever shared."}
                    {" "}Send a fresh link if you'd like to ask again.
                  </p>
                  <button
                    onClick={regenerateLink}
                    disabled={regenerating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-colors disabled:opacity-50"
                  >
                    {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Send a New Link
                  </button>
                </div>
              )}

              {shareLink && consentStatus === 'pending' && !inviteExpired && (
                <div className="p-3 bg-surface rounded-lg border border-border space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Their private link</span>
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] text-text-main truncate flex-1">{shareLink}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(shareLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                      aria-label={linkCopied ? "Link copied" : "Copy private link to clipboard"}
                      className="text-text-muted hover:text-primary transition-colors shrink-0"
                      title="Copy link"
                    >
                      {linkCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-success dark:text-[#4ade80]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-text-muted">Nothing will be shared until they accept.</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted">What they can see</h4>
                  <ShieldCheck className="w-4 h-4 text-text-muted" />
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Target className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Shared Goals</span>
                    </div>
                    <input type="checkbox" checked={previewedSharing.viewGoals} onChange={() => requestCapsuleToggle('viewGoals', !previewedSharing.viewGoals)} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Award className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Milestone Updates</span>
                    </div>
                    <input type="checkbox" checked={previewedSharing.viewMilestones} onChange={() => requestCapsuleToggle('viewMilestones', !previewedSharing.viewMilestones)} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Energy Levels</span>
                    </div>
                    <input type="checkbox" checked={previewedSharing.viewEnergyStats} onChange={() => requestCapsuleToggle('viewEnergyStats', !previewedSharing.viewEnergyStats)} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Allow Messages</span>
                    </div>
                    <input type="checkbox" checked={previewedSharing.sendPings} onChange={() => requestCapsuleToggle('sendPings', !previewedSharing.sendPings)} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>
                </div>

                {/* Sharing Preview - mandatory before any change actually
                    commits (Master Support Circle spec): shows exactly
                    what will and won't be visible if confirmed. */}
                <AnimatePresence>
                  {pendingToggle && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div role="alert" className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-3">
                        <p className="text-xs font-bold text-text-main">
                          {pendingToggle.nextOn ? 'Turning this on' : 'Turning this off'} - {allyName || 'your ally'} will be able to see:
                        </p>
                        <ul className="space-y-1">
                          {SUPPORT_CAPSULE_CATEGORIES.map((category) => (
                            <li key={category} className="flex items-center gap-2 text-xs">
                              {previewedSharing[category] ? (
                                <Check className="w-3.5 h-3.5 text-success dark:text-[#4ade80] shrink-0" />
                              ) : (
                                <X className="w-3.5 h-3.5 text-text-muted shrink-0" />
                              )}
                              <span className={previewedSharing[category] ? "text-text-main font-medium" : "text-text-muted"}>
                                {SUPPORT_CAPSULE_CATEGORY_LABELS[category]}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={cancelPendingToggle}
                            disabled={confirmingToggle}
                            className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-surface dark:bg-card text-text-muted hover:bg-border transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={confirmPendingToggle}
                            disabled={confirmingToggle}
                            className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {confirmingToggle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Confirm
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={fetchPreview}
                  className="w-full flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest text-text-muted bg-surface dark:bg-surface/50 hover:bg-border dark:hover:bg-surface rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" /> Preview Their View
                </button>
              </div>

              <div className="pt-4 mt-6 border-t border-border">
                <button
                  onClick={handleRevoke}
                  disabled={revoking}
                  className="w-full flex items-center justify-center gap-2 py-3 text-destructive bg-destructive/5 hover:bg-destructive/10 rounded-lg text-xs uppercase tracking-widest font-medium transition-colors disabled:opacity-50"
                >
                  {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove Ally
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {/* How to Support Me */}
            <div className="card space-y-5">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-bold text-text-main text-lg tracking-tight">How to Support Me</h3>
                  <p className="text-xs text-text-muted mt-0.5">Optional - write a few words if it helps. Only shared with {allyName || 'your ally'} if you turn it on below.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="support-helps" className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">What helps</label>
                  <textarea
                    id="support-helps"
                    value={supportHelps}
                    onChange={(e) => setSupportHelps(e.target.value)}
                    maxLength={300}
                    rows={2}
                    placeholder="e.g. Just checking in without asking for details."
                    className="w-full bg-surface dark:bg-surface border border-border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="support-does-not-help" className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">What doesn't help</label>
                  <textarea
                    id="support-does-not-help"
                    value={supportDoesNotHelp}
                    onChange={(e) => setSupportDoesNotHelp(e.target.value)}
                    maxLength={300}
                    rows={2}
                    placeholder="e.g. Advice I didn't ask for."
                    className="w-full bg-surface dark:bg-surface border border-border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary resize-none"
                  />
                </div>

                <label className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface dark:bg-surface/50 cursor-pointer">
                  <span className="text-xs font-bold text-text-main">Show this to {allyName || 'your ally'}</span>
                  <input
                    type="checkbox"
                    checked={supportVisibleToAlly}
                    onChange={(e) => setSupportVisibleToAlly(e.target.checked)}
                    className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent"
                  />
                </label>

                <button
                  onClick={savePreferences}
                  disabled={savingPreferences}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground hover:opacity-90 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                >
                  {savingPreferences ? <Loader2 className="w-4 h-4 animate-spin" /> : preferencesSaved ? <CheckCircle2 className="w-4 h-4" /> : null}
                  {preferencesSaved ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>

            {/* Our Support Handshake - mutual, non-binding expectations;
                purely informational, nothing here is stored. */}
            <div className="card space-y-4 bg-surface dark:bg-card/50">
              <div className="flex items-center gap-3">
                <HeartHandshake className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-text-main text-lg tracking-tight">Our Support Handshake</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-text-muted">What you're agreeing to</h4>
                  <ul className="text-xs text-text-muted space-y-1.5 leading-relaxed">
                    <li>{allyName || 'Your ally'} only ever sees what you actively choose to share, and you can turn any of it off at any time.</li>
                    <li>This isn't a crisis service - for anything urgent, use Guardian Relay instead.</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-text-muted">What {allyName || 'your ally'} is agreeing to</h4>
                  <ul className="text-xs text-text-muted space-y-1.5 leading-relaxed">
                    <li>They're not expected to diagnose, monitor, or fix anything.</li>
                    <li>They can pause notifications or step back at any time, no explanation required.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Shared Goals */}
            <div className="card space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-text-main text-lg flex items-center gap-2 tracking-tight">
                    <Target className="w-5 h-5 text-primary" /> Boundary Goals
                  </h3>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">Goals you're sharing with {allyName}. Tap to mark today done.</p>
                </div>
                <button
                  onClick={() => setIsAddingGoal(!isAddingGoal)}
                  className="shrink-0 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-text-muted bg-surface dark:bg-surface px-4 py-2.5 rounded-lg hover:bg-border dark:hover:bg-surface transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Goal
                </button>
              </div>

              <AnimatePresence>
                {isAddingGoal && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={addNewGoal}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-3 bg-surface dark:bg-card border border-border p-2 rounded-lg">
                      <input
                        type="text"
                        aria-label="New shared goal"
                        value={newGoalText}
                        onChange={(e) => setNewGoalText(e.target.value)}
                        placeholder="e.g. No meetings after 6pm..."
                        maxLength={200}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium px-3 text-text-main"
                        autoFocus
                      />
                      <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-colors">Confirm</button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                {sharedGoals.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-text-muted font-medium">No goals yet — add one above to start sharing progress.</p>
                  </div>
                ) : sharedGoals.map(goal => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const completedToday = goal.completedDates.includes(todayStr);
                  const streak = computeStreak(goal.completedDates);
                  return (
                    <motion.div
                      layout
                      key={goal.id}
                      className={cn(
                        "group flex items-center justify-between p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden",
                        completedToday ? "bg-success/5 border-success/20" : "bg-white dark:bg-card border-border hover:border-primary/30 shadow-sm hover:shadow"
                      )}
                    >
                      {completedToday && <div className="absolute inset-y-0 left-0 w-1 bg-success" />}

                      <div
                        className="flex items-center gap-4 cursor-pointer flex-1"
                        onClick={() => toggleGoalToday(goal)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGoalToday(goal); } }}
                        role="checkbox"
                        aria-checked={completedToday}
                        aria-label={`Mark "${goal.text}" as ${completedToday ? 'not done' : 'done'} for today`}
                        tabIndex={0}
                      >
                        <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 border-2 transition-all", completedToday ? "bg-success border-success text-white" : "border-border dark:border-muted-foreground text-transparent")}>
                          <CheckSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <span className={cn("text-sm font-bold transition-all block", completedToday ? "text-text-muted line-through" : "text-text-main")}>{goal.text}</span>
                          <div className="flex items-center gap-3 mt-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">{goal.category}</span>
                            {streak > 0 && <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-warning flex items-center gap-1"><Zap className="w-3 h-3" /> {streak} Day Streak</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        aria-label={`Remove goal: ${goal.text}`}
                        className="text-text-muted hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-destructive rounded shrink-0 ml-2"
                        title="Remove goal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Encouragement Feed */}
            <div className="card space-y-6 bg-surface dark:bg-card/50">
              <div>
                <h3 className="font-bold text-text-main text-lg flex items-center gap-2 tracking-tight">
                  <Brain className="w-5 h-5 text-primary" /> Encouragement Feed
                </h3>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">Notes from {allyName || 'your ally'}, sent from their private link.</p>
              </div>

              <div className="space-y-4">
                {encouragements.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-text-muted font-medium max-w-xs mx-auto leading-relaxed">
                      No notes yet. Once {allyName || 'your ally'} visits their link and leaves one, it'll appear here.
                    </p>
                  </div>
                ) : encouragements.map((enc, i) => (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={enc.id}
                    className="flex gap-4"
                  >
                    <div className="flex flex-col items-center">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 text-xs", enc.type === 'system' ? "bg-border dark:bg-surface border-border text-text-muted" : "bg-primary-light dark:bg-primary/20 border-primary-light dark:border-primary/30 text-[#9a3412] dark:text-primary")}>
                        {enc.type === 'system' ? <Clock className="w-3.5 h-3.5" /> : allyName.charAt(0)}
                      </div>
                      {i !== encouragements.length - 1 && <div className="w-px h-full bg-border mt-2" />}
                    </div>

                    <div className="flex-1 pb-6">
                      <div className="bg-white dark:bg-surface border border-border p-4 rounded-2xl rounded-tl-none shadow-sm">
                        <p className={cn("text-sm font-medium leading-relaxed", enc.type === 'system' ? "text-text-muted font-mono text-xs" : "text-text-main")}>
                          {enc.type === 'personal' ? `"${enc.message}"` : enc.message}
                        </p>
                      </div>
                      <p className="text-[11px] text-text-muted mt-2 uppercase tracking-widest font-black pl-1">
                        {new Date(enc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

          </div>
        </motion.div>
      )}

      {/* Preview Their View - the owner's own real current data, rendered
          exactly as the ally's page would show it right now. */}
      <AnimatePresence>
        {previewOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewOpen(false)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="preview-their-view-title"
              className="relative card w-full max-w-lg p-8 bg-white dark:bg-card border border-border shadow-lg space-y-6 max-h-[80vh] overflow-y-auto"
            >
              <button
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                className="absolute top-6 right-6 p-2 text-text-muted hover:bg-surface dark:hover:bg-surface rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <Eye className="w-5 h-5 text-primary" />
                <h3 id="preview-their-view-title" className="text-lg font-bold text-text-main tracking-tight">Preview Their View</h3>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                This is exactly what {allyName || 'your ally'} sees on their own private link right now - not an example.
              </p>

              {previewLoading ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : previewError ? (
                <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl">{previewError}</div>
              ) : previewData ? (
                <div className="space-y-4">
                  {previewData.sharedGoals && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-widest text-text-muted">Their Boundary Goals</h4>
                      {previewData.sharedGoals.length === 0 ? (
                        <p className="text-sm text-text-muted">No goals shared yet.</p>
                      ) : previewData.sharedGoals.map((goal) => (
                        <div key={goal.id} className={cn("flex items-center justify-between p-3 rounded-xl border", goal.completedToday ? "bg-success/5 border-success/20" : "bg-surface border-border")}>
                          <span className="text-sm font-medium text-text-main">{goal.text}</span>
                          {goal.streak > 0 && <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-warning">{goal.streak} day{goal.streak === 1 ? '' : 's'}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {typeof previewData.longestStreak === 'number' && (
                    <p className="text-sm text-text-main"><strong>Longest current streak:</strong> {previewData.longestStreak} day{previewData.longestStreak === 1 ? '' : 's'}</p>
                  )}
                  {typeof previewData.recentAvgMood === 'number' && (
                    <p className="text-sm text-text-main"><strong>Recent average mood:</strong> {previewData.recentAvgMood}/10</p>
                  )}
                  {previewData.supportPreferences && (
                    <div className="space-y-2 p-3 bg-surface border border-border rounded-xl">
                      <h4 className="text-xs font-black uppercase tracking-widest text-text-muted">How to Support Me</h4>
                      {previewData.supportPreferences.helps && <p className="text-sm text-text-main"><strong>Helps:</strong> {previewData.supportPreferences.helps}</p>}
                      {previewData.supportPreferences.doesNotHelp && <p className="text-sm text-text-main"><strong>Doesn't help:</strong> {previewData.supportPreferences.doesNotHelp}</p>}
                    </div>
                  )}
                  {!previewData.sharedGoals && typeof previewData.longestStreak !== 'number' && typeof previewData.recentAvgMood !== 'number' && !previewData.supportPreferences && (
                    <p className="text-sm text-text-muted">Nothing is shared right now - {allyName || 'your ally'}'s page would be empty aside from the note box.</p>
                  )}
                </div>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

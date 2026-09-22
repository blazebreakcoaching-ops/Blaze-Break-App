import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, PhoneCall, Send, Copy, CheckCircle2, Loader2, UserPlus, Compass, ChevronLeft } from 'lucide-react';
import { useFocusTrap } from '../lib/useFocusTrap';
import { secureApiFetch } from '../lib/secure-api';
import { auth } from '../lib/firebase';
import { loadSupportCircle } from '../lib/support-circle';
import { useGuardianAlertsEnabled } from '../lib/useGuardianAlertsEnabled';
import { isRealGuardian, extractFirstName } from '../../guardian-alert';
import { GUARDIAN_SUPPORT_TEMPLATES, buildGuardianSupportMessage, GuardianSupportTemplateId } from '../../guardian-support-invitation';
import { logGuardianSupportEvent } from '../lib/guardian-support-analytics';
import type { SupportContact } from '../types';

// Review-and-confirm sheet for the Guardian Support Invitation. Every
// external action here requires an explicit tap immediately before it
// happens - nothing is pre-selected, nothing auto-advances, and the exact
// recipient/message is always shown before anything can be sent. Dispatch
// goes through the existing, hardened POST /api/guardian/alert - this
// component has no send capability of its own, matching
// docs/GUARDIAN_SUPPORT_INVITATION.md's deterministic-dispatch rule.

const TEMPLATE_LABELS: Record<GuardianSupportTemplateId, string> = {
  standard: 'Standard - asking for support',
  more_urgent: 'More direct - asking to hear back soon',
};

// Shows the last 4 digits only, matching guardian-alert.ts's own
// log-redaction convention (D.9: "last 4 digits only where needed") - the
// user still sees enough to confirm it's the right person, without the
// full number sitting on screen or in a screenshot.
const maskPhone = (phone: string): string => {
  if (phone.length <= 4) return phone;
  return `•••• ${phone.slice(-4)}`;
};

type Step = 'loading' | 'no_guardian' | 'pick_contact' | 'review' | 'sending' | 'sent' | 'failed';

interface GuardianConfirmSheetProps {
  userName?: string;
  onClose: () => void;
}

export const GuardianConfirmSheet = ({ userName, onClose }: GuardianConfirmSheetProps) => {
  const dialogRef = useFocusTrap(true);
  // The invitation card being shown at all is already gated on
  // guardianSupportInvitationEnabled, but that only controls whether Nova
  // OFFERS this sheet - it says nothing about whether a send can actually
  // go through right now. Sending is gated separately by alertsEnabled
  // (guardian-alert.ts's GUARDIAN_ALERTS_FLAG, the same one
  // NovaGuardianRelay.tsx and CrisisSupport.tsx already check), so this
  // sheet must check it too - otherwise "Send it now" would claim a
  // capability that's actually off, the exact failure mode
  // guardian-copy-safety.test.ts exists to catch.
  const alertsEnabled = useGuardianAlertsEnabled();
  const [step, setStep] = useState<Step>('loading');
  const [guardians, setGuardians] = useState<SupportContact[]>([]);
  const [selected, setSelected] = useState<SupportContact | null>(null);
  const [templateId, setTemplateId] = useState<GuardianSupportTemplateId>('standard');
  const [copied, setCopied] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) { setStep('no_guardian'); return; }
      try {
        const contacts = await loadSupportCircle(uid);
        if (cancelled) return;
        const real = contacts.filter(isRealGuardian);
        setGuardians(real);
        if (real.length === 0) {
          logGuardianSupportEvent('no_guardian_configured');
          setStep('no_guardian');
        } else if (real.length === 1) {
          setSelected(real[0]);
          setStep('review');
        } else {
          setStep('pick_contact');
        }
      } catch {
        if (!cancelled) setStep('no_guardian');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const senderFirstName = extractFirstName(userName);
  const message = selected
    ? buildGuardianSupportMessage(templateId, { guardianFirstName: extractFirstName(selected.name), senderFirstName })
    : '';

  const handleCall = () => {
    if (!selected) return;
    logGuardianSupportEvent('call_action_opened', { contactId: selected.id });
    window.location.href = `tel:${selected.contactMethod}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      logGuardianSupportEvent('message_copied', selected ? { contactId: selected.id } : undefined);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Non-fatal - the message is still visible on screen to copy manually.
    }
  };

  const handleOpenMessagingApp = () => {
    if (!selected) return;
    logGuardianSupportEvent('messaging_handoff_opened', { contactId: selected.id, channel: 'sms' });
    window.location.href = `sms:${selected.contactMethod}?body=${encodeURIComponent(message)}`;
  };

  const handleSend = async () => {
    if (!selected) return;
    setStep('sending');
    logGuardianSupportEvent('send_requested', { contactId: selected.id, channel: selected.notificationPreference === 'whatsapp' ? 'whatsapp' : 'sms' });
    const idempotencyKey = `${selected.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      const res = await secureApiFetch('/api/guardian/alert', {
        method: 'POST',
        data: { contactId: selected.id, idempotencyKey, templateId },
      });
      const body = await res.json();
      if (res.ok) {
        setResultMessage(body.userMessage || `Sent to ${selected.name}.`);
        logGuardianSupportEvent('send_succeeded', { contactId: selected.id });
        setStep('sent');
      } else {
        setResultMessage(body.userMessage || body.error || "I couldn't get that message through. That's a problem on this end, not yours.");
        logGuardianSupportEvent('send_failed', { contactId: selected.id });
        setStep('failed');
      }
    } catch {
      setResultMessage("I couldn't reach the messaging service right now. That's a problem on this end, not yours.");
      logGuardianSupportEvent('send_failed', { contactId: selected.id });
      setStep('failed');
    }
  };

  const handleExploreOtherSupport = () => {
    logGuardianSupportEvent('resource_route_opened');
    window.dispatchEvent(new CustomEvent('open_crisis_support'));
    onClose();
  };

  const handleAddGuardian = () => {
    window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'ally' }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        ref={dialogRef as any}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guardian-confirm-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative card w-full max-w-md max-h-[85vh] overflow-y-auto bg-card border border-border shadow-lg p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id="guardian-confirm-title" className="text-lg font-bold text-text-main leading-snug">
            {step === 'no_guardian' ? "No Guardian set up yet" : 'Reach out to your Guardian'}
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 rounded-full text-text-muted hover:text-text-main hover:bg-surface transition-colors shrink-0">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {step === 'loading' && (
          <div className="py-10 flex justify-center" role="status" aria-live="polite">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" aria-hidden="true" />
          </div>
        )}

        {step === 'no_guardian' && (
          <div className="space-y-3">
            <p className="text-sm text-text-muted leading-relaxed">
              I don't have anyone set up to contact for you yet. You can add someone you trust - then reaching them is one tap, any time.
            </p>
            <button onClick={handleAddGuardian} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
              <UserPlus className="w-4 h-4" aria-hidden="true" /> Add someone I trust
            </button>
            <button onClick={handleExploreOtherSupport} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-surface hover:bg-border/40 text-text-main text-sm font-bold transition-colors">
              <Compass className="w-4 h-4" aria-hidden="true" /> Explore urgent support options
            </button>
            <button onClick={onClose} className="w-full text-center text-sm text-text-muted hover:text-text-main transition-colors py-2">
              Continue chatting
            </button>
          </div>
        )}

        {step === 'pick_contact' && (
          <div className="space-y-2">
            <p className="text-sm text-text-muted">Who would you like to reach?</p>
            {guardians.map((g) => (
              <button
                key={g.id}
                onClick={() => { setSelected(g); setStep('review'); }}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
              >
                <span className="text-sm font-bold text-text-main">{g.name}</span>
                <span className="text-xs text-text-muted font-mono">{maskPhone(g.contactMethod)}</span>
              </button>
            ))}
          </div>
        )}

        {(step === 'review' || step === 'sending') && selected && (
          <div className="space-y-4">
            {guardians.length > 1 && (
              <button onClick={() => setStep('pick_contact')} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-main transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" /> Choose someone else
              </button>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-text-main">{selected.name}</span>
              <span className="text-xs text-text-muted font-mono">{maskPhone(selected.contactMethod)}</span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="guardian-template-select" className="text-xs font-bold text-text-muted uppercase tracking-wide">Message</label>
              <select
                id="guardian-template-select"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value as GuardianSupportTemplateId)}
                disabled={step === 'sending'}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                {Object.keys(GUARDIAN_SUPPORT_TEMPLATES).map((id) => (
                  <option key={id} value={id}>{TEMPLATE_LABELS[id as GuardianSupportTemplateId]}</option>
                ))}
              </select>
            </div>

            <div className="p-4 bg-surface rounded-xl border border-border/50">
              <p className="text-sm text-text-main leading-relaxed">{message}</p>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              {selected.name} may not be available or able to respond right away. This isn't a replacement for emergency or urgent professional help.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleCall} disabled={step === 'sending'} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-surface hover:bg-border/40 text-text-main text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50">
                <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" /> Call {selected.name}
              </button>
              <button onClick={handleCopy} disabled={step === 'sending'} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-surface hover:bg-border/40 text-text-main text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50">
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy message'}
              </button>
            </div>
            <button onClick={handleOpenMessagingApp} disabled={step === 'sending'} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-surface hover:bg-border/40 text-text-main text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50">
              Open my messaging app with this ready to send
            </button>

            {!alertsEnabled && (
              <p className="text-xs text-center text-text-muted py-1">
                Sending through the app is temporarily unavailable - please use call, copy, or your own messaging app instead.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={onClose} disabled={step === 'sending'} className="py-3 rounded-xl font-bold text-xs uppercase tracking-widest bg-surface text-text-muted hover:bg-border/40 transition-colors disabled:opacity-40">
                Not right now
              </button>
              {alertsEnabled && (
                <button
                  onClick={handleSend}
                  disabled={step === 'sending'}
                  className="py-3 rounded-xl font-bold text-xs uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {step === 'sending' ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Sending…</> : <><Send className="w-4 h-4" aria-hidden="true" /> Send it now</>}
                </button>
              )}
            </div>
          </div>
        )}

        {(step === 'sent' || step === 'failed') && (
          <div className="py-4 text-center space-y-4" role="status" aria-live="polite">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${step === 'sent' ? 'bg-success/20 text-success' : 'bg-destructive/10 text-destructive'}`}>
              {step === 'sent' ? <CheckCircle2 className="w-7 h-7" aria-hidden="true" /> : <X className="w-7 h-7" aria-hidden="true" />}
            </div>
            <p className="text-sm font-medium text-text-main">{resultMessage}</p>
            {step === 'failed' && (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setStep('review')} className="py-3 rounded-xl font-bold text-xs uppercase tracking-widest bg-surface text-text-main hover:bg-border/40 transition-colors">
                  Try again
                </button>
                <button onClick={handleExploreOtherSupport} className="py-3 rounded-xl font-bold text-xs uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                  Other support
                </button>
              </div>
            )}
            {step === 'sent' && (
              <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest bg-surface text-text-main hover:bg-border/40 transition-colors">
                Close
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default GuardianConfirmSheet;

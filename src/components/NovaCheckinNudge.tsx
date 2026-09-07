import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';
import { shouldSuggestCheckin, VoiceSessionRecord } from '../../voice-continuity';

// A consented, gentle, in-app nudge to talk with Nova by voice again. Two
// hard rules keep this humane rather than nagging:
//   1. It NEVER appears until the person has actually had a voice call - we
//      don't push a feature they've never chosen.
//   2. It only ever reminds INSIDE the app; it never sends an unsolicited
//      message or notification. Reminding someone with a mental-health app is
//      sensitive, so this stays opt-in and easy to turn off.
// The opt-in itself is offered contextually here (right where a returning
// user would see it), and the timing maths lives in the tested pure module.

const CONSENT_KEY = 'blaze_nova_checkin_consent'; // 'weekly' | 'biweekly' | 'off' | (unset)
const CADENCE_DAYS: Record<string, number> = { weekly: 7, biweekly: 14 };

type Consent = 'weekly' | 'biweekly' | 'off' | null;

function readConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'weekly' || v === 'biweekly' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}
function writeConsent(v: Consent) {
  try { if (v) localStorage.setItem(CONSENT_KEY, v); } catch { /* private mode - fine */ }
}

export const NovaCheckinNudge = ({ onTalk }: { onTalk: () => void }) => {
  const [sessions, setSessions] = useState<VoiceSessionRecord[] | null>(null);
  const [consent, setConsent] = useState<Consent>(() => readConsent());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await secureApiFetch('/api/nova/voice-sessions', { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setSessions((data.sessions || []) as VoiceSessionRecord[]);
        } else if (!cancelled) setSessions([]);
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (dismissed || sessions === null) return null;
  if (sessions.length === 0) return null; // never nudge someone who's never called

  // Not yet decided: offer the opt-in once, now that they've used voice.
  if (consent === null) {
    const choose = (c: Consent) => { writeConsent(c); setConsent(c); };
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-text-main">Want a gentle nudge to check in with Nova now and then?</p>
          <p className="text-xs text-text-muted mt-0.5">Only inside the app — never a text or a call out of the blue. You can change this any time.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => choose('weekly')} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:opacity-90 transition-opacity">Weekly</button>
          <button onClick={() => choose('biweekly')} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-text-main hover:border-primary/40 transition-colors">Every 2 weeks</button>
          <button onClick={() => choose('off')} className="rounded-full px-3 py-2 text-xs font-medium text-text-muted hover:text-text-main transition-colors">No thanks</button>
        </div>
      </div>
    );
  }

  // Opted in: show the reminder only when a check-in is genuinely due.
  const cadence = CADENCE_DAYS[consent] ?? 0;
  if (!shouldSuggestCheckin(sessions, Date.now(), cadence, consent !== 'off')) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
        <Sparkles className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-text-main">It's been a little while — want to talk with Nova?</p>
        <p className="text-xs text-text-muted mt-0.5">A couple of minutes by voice, whenever you're ready.</p>
      </div>
      <button onClick={onTalk} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:opacity-90 transition-opacity shrink-0">
        Talk with Nova
      </button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss for now" className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface transition-colors shrink-0">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default NovaCheckinNudge;

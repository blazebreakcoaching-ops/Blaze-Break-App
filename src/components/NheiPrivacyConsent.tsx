import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Lock, Download, Trash2, Info, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { secureApiFetch, SecureApiError } from '../lib/secure-api.ts';
import type { NheiConsentPurpose } from '../../nhei-consent';

// NHEI PHASE 5 - Privacy & consent screens (directive §2).
// NHEI PHASE 5C UPDATE (directive §2, "implement real NHEI
// consent-writing infrastructure"): server.ts now has real routes
// (GET/POST /api/nhei/consent) backed by the already-existing
// getNheiConsent/setNheiConsent/withdrawNheiConsent
// (nhei-persistence-service.ts) - see docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md
// workstream O. The three personal-purpose toggles below are now REAL:
// each one independently reads/writes exactly one purpose
// (reflection_storage / longitudinal_tracking / routing_insights) via
// that route, nothing else. Toggling "on" here only ever writes that one
// boolean - it does NOT activate any personal NHEI processing by
// itself (Educational Mode's own two gates are untouched; Personal
// Reflection/Longitudinal/Recovery Insights remain unwired into any
// conversation route, and the independent safeguarding system remains
// unbuilt) - "the consent interface may be implemented... but do not
// activate personal NHEI processing until separate requirements are
// satisfied" (Phase 5C directive §2). This component is still not
// mounted into App.tsx's live navigation (see NheiPhase5Preview.tsx) -
// "implemented and tested in development" per the same directive line.
//
// Export and full-account deletion ARE real, already-working backend
// capabilities (GET /api/user/export includes NHEI data via
// exportAllNheiData; POST /api/user/delete-account erases everything,
// NHEI included) - those two affordances are described as REAL here,
// distinct from the disabled toggles, consistent with
// docs/NHEI_RELEASE_BLOCKERS.md's own "explicitly not a blocker"
// section. There is no granular, NHEI-purpose-specific partial deletion
// route today - only whole-account export/erase - and this component
// says so rather than implying otherwise.
//
// Reuses this app's existing toggle visual convention (ConsentMatrix.tsx)
// and card/typography conventions elsewhere in this file set, rather
// than inventing a new visual language for NHEI specifically.
//
// OFFLINE AT THIS PHASE: not mounted into App.tsx's live navigation -
// see NheiPhase5Preview.tsx.

export type NheiConsentMode = 'educational' | 'reflection' | 'longitudinal' | 'routing_insights';

interface NheiModeDescriptor {
  mode: NheiConsentMode;
  title: string;
  requiresConsent: boolean;
  purpose: NheiConsentPurpose | null;
  dependsOn: NheiConsentPurpose | null; // informational only - toggling this mode never writes dependsOn's flag
  description: string;
  dataHandling: string;
}

const NHEI_MODES: NheiModeDescriptor[] = [
  {
    mode: 'educational',
    title: 'Educational Mode',
    requiresConsent: false,
    purpose: null,
    dependsOn: null,
    description: 'General education about burnout recovery concepts, drawn from reviewed reference material. Nothing you say is stored as personal evidence, and no personal tracking consent is needed to use it.',
    dataHandling: 'No NHEI personal evidence is extracted or stored. Your chat messages are used only to pick relevant topics, the same way a search works - nothing is kept afterward.',
  },
  {
    mode: 'reflection',
    title: 'Personal Reflection',
    requiresConsent: true,
    purpose: 'reflection_storage',
    dependsOn: null,
    description: 'Optional analysis of experiences you choose to share, so Nova can reflect patterns back to you over time.',
    dataHandling: 'With this on, specific things you report (never a full transcript) are tagged by category and kept as structured records - never free text. You can see, correct, or delete these at any time (see below).',
  },
  {
    mode: 'longitudinal',
    title: 'Longitudinal Intelligence',
    requiresConsent: true,
    purpose: 'longitudinal_tracking',
    dependsOn: 'reflection_storage',
    description: 'Optional comparison across your prior reflections, so Nova can notice when something echoes an earlier experience.',
    dataHandling: 'Requires Personal Reflection to also be on. With both on, Nova may reference how a past, already-recorded reflection relates to a new one - always shown as a pattern to consider, never a settled fact. Turning this on by itself never grants access to your reflection evidence - that still requires reflection_storage separately.',
  },
  {
    mode: 'routing_insights',
    title: 'Recovery Insights',
    requiresConsent: true,
    purpose: 'routing_insights',
    dependsOn: 'reflection_storage',
    description: 'Optional, NHEI-informed suggestions for which recovery tool might help, based on what you’ve reflected on.',
    dataHandling: 'Requires Personal Reflection to also be on. With this on, Nova may suggest a specific recovery tool and explain why - always something you choose to try or skip, never automatic.',
  },
];

function ConsentToggle({
  label, checked, pending, onToggle,
}: { label: string; checked: boolean; pending: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={pending}
      onClick={onToggle}
      className={cn(
        'w-12 h-6 rounded-full relative flex-shrink-0 transition-colors',
        checked ? 'bg-primary' : 'bg-surface',
        pending && 'opacity-60 cursor-wait',
      )}
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-white absolute top-1 left-1" />
      ) : (
        <div className={cn('w-4 h-4 rounded-full bg-white absolute top-1 transition-all', checked ? 'left-7' : 'left-1')} />
      )}
    </button>
  );
}

function ModeCard({
  descriptor, checked, dependsOnChecked, pending, error, onToggle,
}: {
  descriptor: NheiModeDescriptor;
  checked: boolean;
  dependsOnChecked: boolean;
  pending: boolean;
  error: string | null;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn('p-5 rounded-2xl border transition-all', 'bg-surface/50 border-white/[0.05]')}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-surface text-text-muted border-border">
            {descriptor.requiresConsent ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          </div>
          <div>
            <h4 className="text-sm font-bold tracking-tight text-text-main">{descriptor.title}</h4>
            <p className="text-[11px] text-text-muted mt-1 max-w-md">{descriptor.description}</p>
          </div>
        </div>
        {descriptor.requiresConsent ? (
          <ConsentToggle label={descriptor.title} checked={checked} pending={pending} onToggle={onToggle} />
        ) : (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-card text-text-muted border border-border">No consent needed</span>
        )}
      </div>

      {descriptor.requiresConsent && checked && descriptor.dependsOn && !dependsOnChecked && (
        <p className="text-[10px] text-amber-500 mt-2 pl-12">
          On, but inactive until Personal Reflection is also on - this purpose is granted independently and does not imply the other.
        </p>
      )}
      {error && (
        <p className="text-[10px] text-destructive mt-2 pl-12">{error}</p>
      )}

      <button onClick={() => setExpanded((v) => !v)} className="text-[11px] font-bold text-primary mt-3 pl-12 hover:underline">
        {expanded ? 'Hide details' : 'What happens with this on?'}
      </button>
      {expanded && (
        <p className="text-[11px] text-text-muted leading-relaxed mt-2 pl-12 max-w-md">{descriptor.dataHandling}</p>
      )}
    </div>
  );
}

type NheiConsentState = Record<NheiConsentPurpose, boolean>;

const CONSENT_DEFAULTS: NheiConsentState = { reflection_storage: false, longitudinal_tracking: false, routing_insights: false };

export const NheiPrivacyConsent = () => {
  const [consent, setConsent] = useState<NheiConsentState>(CONSENT_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [pendingPurpose, setPendingPurpose] = useState<NheiConsentPurpose | null>(null);
  const [errors, setErrors] = useState<Partial<Record<NheiConsentPurpose, string>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await secureApiFetch('/api/nhei/consent');
        const body = await res.json();
        if (!cancelled) setConsent(body.consent ?? CONSENT_DEFAULTS);
      } catch {
        // Not signed in, or the request failed - toggles stay at the safe, all-off default rather than guessing.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = useCallback(async (purpose: NheiConsentPurpose) => {
    const next = !consent[purpose];
    setPendingPurpose(purpose);
    setErrors((prev) => ({ ...prev, [purpose]: undefined }));
    try {
      const res = await secureApiFetch('/api/nhei/consent', { method: 'POST', data: { purpose, granted: next } });
      const body = await res.json();
      setConsent(body.consent);
    } catch (err) {
      const message = err instanceof SecureApiError ? err.message : 'Could not update this - please try again.';
      setErrors((prev) => ({ ...prev, [purpose]: message }));
    } finally {
      setPendingPurpose(null);
    }
  }, [consent]);

  return (
    <div className="card space-y-6 bg-background border border-border">
      <div>
        <h3 className="text-xl font-bold text-text-main flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> Nova Personal Intelligence (NHEI) - Privacy & Consent
        </h3>
        <p className="text-xs text-text-muted max-w-xl leading-relaxed flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          These toggles save a real choice to your account{!loaded && ' (loading your current settings...)'}. Turning one on does not
          turn on any feature by itself - Nova's personal reflection, longitudinal, and recovery-insight modes are still off while
          further safety review is pending, regardless of what you choose here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {NHEI_MODES.map((descriptor) => (
          <ModeCard
            key={descriptor.mode}
            descriptor={descriptor}
            checked={descriptor.purpose ? consent[descriptor.purpose] : false}
            dependsOnChecked={descriptor.dependsOn ? consent[descriptor.dependsOn] : true}
            pending={pendingPurpose === descriptor.purpose}
            error={descriptor.purpose ? errors[descriptor.purpose] ?? null : null}
            onToggle={() => descriptor.purpose && toggle(descriptor.purpose)}
          />
        ))}
      </div>

      <div className="pt-4 border-t border-border space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">Your data</h4>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="/api/user/export"
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export everything (real, works today)
          </a>
          <span className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-border text-xs font-bold text-text-muted">
            <Trash2 className="w-3.5 h-3.5" /> Delete just my reflections - not yet available (whole-account deletion already works, in Settings)
          </span>
        </div>
        <p className="text-[10px] text-text-muted/80">
          There is no way yet to delete only your NHEI reflections while keeping the rest of your account - deleting your whole account
          (Settings → Delete Account) does remove them, along with everything else.
        </p>
      </div>
    </div>
  );
};

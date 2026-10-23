import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { NheiPrivacyConsent } from './NheiPrivacyConsent';
import { NheiRecoverySuggestionCard } from './NheiRecoverySuggestionCard';
import { NheiReflectionPreview } from './NheiReflectionPreview';
import { NheiBeforeWords } from './NheiBeforeWords';
import { NheiAgenticActionPreview } from './NheiAgenticActionPreview';
import { NovaInvisibleLoad } from './NovaInvisibleLoad';
import { arbitrateNheiRecoverySuggestions } from '../../nhei-recovery-arbitration';
import type { NheiRecoverySuggestion } from '../../nhei-recovery-bridge-types';
import type { NovaStatedPracticalProblem } from '../../nova-take-the-load-types';

// NHEI PHASE 5 - OFFLINE DEVELOPER PREVIEW HARNESS
//
// This file composes every Phase 5 UI piece for manual/dev-server
// review in one place. IT IS NOT IMPORTED BY App.tsx AND IS NOT
// REACHABLE BY ANY REAL USER - confirmed by grep: no file outside this
// one and its own nature imports it. A real user can never navigate
// here. If a future phase wants any of these components live, that is
// its own separate, explicit wiring decision - mounting this harness
// itself is never the way that would happen.
//
// The suggestion card below uses a hand-built, synthetic arbitration
// result (not real NHEI evidence) purely so the card has something to
// render in this preview.

function syntheticSuggestion(overrides: Partial<NheiRecoverySuggestion> & Pick<NheiRecoverySuggestion, 'targetModule' | 'routeType'>): NheiRecoverySuggestion {
  return {
    suggestionId: `${overrides.targetModule}_preview`,
    relevantCapabilityLabel: overrides.targetModule,
    reason: 'Synthetic preview reason.',
    explanationForUser: 'This is placeholder explanation text for the offline developer preview - never real evidence.',
    evidenceReferences: [],
    selfSystems: ['INTERNAL_SELF'],
    dimensions: ['EMOTIONAL'],
    interpretationKind: 'tentative',
    safetyRestrictions: ['not_diagnostic'],
    consentPrerequisite: 'routing_insights',
    capacitySuitability: 'suitable',
    matchesStatedGoal: false,
    matchingExistingCandidateId: null,
    alternativeModules: [],
    ...overrides,
  };
}

const PREVIEW_ARBITRATION = arbitrateNheiRecoverySuggestions({
  suggestions: [
    syntheticSuggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'confirmed' }),
    syntheticSuggestion({ targetModule: 'my_patterns', routeType: 'UNDERSTAND' }),
  ],
});

export const NheiPhase5Preview = () => {
  const [requestedHelp, setRequestedHelp] = useState<NovaStatedPracticalProblem | null>(null);
  return (
  <div className="max-w-2xl mx-auto space-y-10 p-6">
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
      <p className="text-xs text-destructive leading-relaxed">
        NHEI/Nova offline developer preview (Phase 5-5C). Not reachable by any real user, not wired to any live route, not
        feature-flag-gated for activation - this page exists only to review this UI work. Every control on this
        page operates on local/synthetic state only, except the Privacy & Consent toggles below, which write a REAL
        per-purpose consent flag to your own account (see NheiPrivacyConsent.tsx's own header) - still never activating
        any personal NHEI processing by itself.
      </p>
    </div>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">0. Invisible Load</h2>
      <NovaInvisibleLoad onRequestHelp={setRequestedHelp} />
      {requestedHelp && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs text-text-main">
          This would become a Take the Load request: <span className="italic">"{requestedHelp.description}"</span>
          <br />(see section 5 below for the agentic action contract this would feed into - not wired together in this preview)
        </div>
      )}
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">1. Privacy & Consent</h2>
      <NheiPrivacyConsent />
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">2. Recovery Suggestion Card</h2>
      <NheiRecoverySuggestionCard arbitration={PREVIEW_ARBITRATION} />
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">3. Reflection & Correction Preview</h2>
      <NheiReflectionPreview />
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">4. Before Words</h2>
      <NheiBeforeWords />
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">5. Agentic Action Permission</h2>
      <NheiAgenticActionPreview />
    </section>
  </div>
  );
};

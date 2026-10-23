import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { NheiPrivacyConsent } from './NheiPrivacyConsent';
import { NheiRecoverySuggestionCard } from './NheiRecoverySuggestionCard';
import { NheiReflectionPreview } from './NheiReflectionPreview';
import { NheiBeforeWords } from './NheiBeforeWords';
import { NheiAgenticActionPreview } from './NheiAgenticActionPreview';
import { NovaInvisibleLoad } from './NovaInvisibleLoad';
import { NovaTakeTheLoad } from './NovaTakeTheLoad';
import { NovaChat } from './NovaChat';
import { NovaAgenticJourney } from './NovaAgenticJourney';
import { arbitrateNheiRecoverySuggestions } from '../../nhei-recovery-arbitration';
import type { NheiRecoverySuggestion } from '../../nhei-recovery-bridge-types';
import type { NovaStatedPracticalProblem } from '../../nova-take-the-load-types';
import type { NovaTemporaryBeforeWordsContext } from '../../nova-before-words-temporary-context';

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
  // Phase 5E (directive §5): the one place this still-offline harness
  // demonstrates the real handoff - Before Words' `onDecided` feeds a
  // genuinely mounted NovaChat instance's `temporaryBeforeWordsContext`
  // prop, which folds it into the very next outgoing
  // `/api/nova/chat` request (NovaChat.tsx's own `fullSystemInstruction`),
  // then clears itself once `onTemporaryBeforeWordsContextConsumed` fires.
  // This is the "connect meaningfully to Nova's actual conversation
  // system" step the directive asks for - not a second, parallel preview.
  const [beforeWordsContext, setBeforeWordsContext] = useState<NovaTemporaryBeforeWordsContext | null>(null);
  return (
  <div className="max-w-2xl mx-auto space-y-10 p-6">
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
      <p className="text-xs text-destructive leading-relaxed">
        NHEI/Nova offline developer preview (Phase 5-5E). Not reachable by any real user, not wired to any live route, not
        feature-flag-gated for activation - this page exists only to review this UI work. Every control on this
        page operates on local/synthetic state only, except the Privacy & Consent toggles, the Take the Load section,
        and the Nova Chat section below, which make REAL calls to this account's own server routes (see
        NheiPrivacyConsent.tsx's, NovaTakeTheLoad.tsx's, and NovaChat.tsx's own headers) - still never activating any
        personal NHEI processing, and never reaching a real external calendar, since real execution stays disabled
        platform-wide.
      </p>
    </div>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">0. Invisible Load</h2>
      <NovaInvisibleLoad onRequestHelp={setRequestedHelp} />
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">0b. Take the Load - Calendar Protection</h2>
      <p className="text-xs text-text-muted">
        {requestedHelp
          ? <>Pre-filled from the Invisible Load item you just asked for help with: <span className="italic text-text-main">"{requestedHelp.description}"</span> - everything below this is a real server call, per NovaTakeTheLoad.tsx's own header.</>
          : 'Ask for help with an Invisible Load item above to pre-fill this, or start one directly below.'}
      </p>
      <NovaTakeTheLoad initialTitle={requestedHelp?.description ?? ''} />
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
      <NheiBeforeWords onDecided={setBeforeWordsContext} />
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">4b. Nova Chat - real conversational continuity</h2>
      <p className="text-xs text-text-muted">
        {beforeWordsContext
          ? 'What you just shared above will be folded into your very next message to Nova below, for that one reply only, then cleared - this is a REAL call to /api/nova/chat, per NovaChat.tsx\'s own header.'
          : 'Finish a Before Words session above (either ending) to see its temporary context carried into a real Nova conversation turn below. You can also just chat with Nova directly - this section makes a REAL call to /api/nova/chat.'}
      </p>
      <NovaChat
        temporaryBeforeWordsContext={beforeWordsContext}
        onTemporaryBeforeWordsContextConsumed={() => setBeforeWordsContext(null)}
      />
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">5. Agentic Action Permission</h2>
      <NheiAgenticActionPreview />
    </section>

    <section className="space-y-3">
      <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">6. Integrated Agentic Nova Journey</h2>
      <p className="text-xs text-text-muted">
        The full chain in one place, per directive §6: Before Words - temporary context - Nova chat - what's on your
        plate - Take the Load/Calendar Protection - approval - result, with an explicit stage label at every step.
        The sections above remain for reviewing each piece on its own; this is the one a real user would actually see.
      </p>
      <NovaAgenticJourney />
    </section>
  </div>
  );
};

// NHEI PHASE 3C-1 - THREE INTELLIGENCE MODES
//
// Section 2's required separation, made into explicit, testable
// authorisation rules rather than left as a convention a caller has to
// remember. Nothing in this file touches Firestore or calls a model -
// it is a pure decision function over an already-fetched NheiConsentState
// (Phase 2's nhei-consent.ts).

import { type NheiConsentState, isNheiPurposeConsented } from './nhei-consent';

export type NheiConversationMode = 'educational' | 'personal_reflection' | 'longitudinal';

export const NHEI_CONVERSATION_MODES: readonly NheiConversationMode[] = ['educational', 'personal_reflection', 'longitudinal'];

export const isValidNheiConversationMode = (value: unknown): value is NheiConversationMode =>
  typeof value === 'string' && (NHEI_CONVERSATION_MODES as readonly string[]).includes(value);

export interface NheiModeAuthorisation {
  mode: NheiConversationMode;
  // Whether the mode may run at all this turn.
  allowed: boolean;
  // Whether anything extracted this turn may be persisted afterward (a
  // SEPARATE question from whether the mode can run - Educational Mode
  // can always run, but can never persist; Personal Reflection Mode can
  // always run, but can only persist with consent).
  mayPersist: boolean;
  // Whether evidence from OTHER, earlier turns/sessions may be read and
  // used this turn - only ever true for Longitudinal Mode with the right
  // consent.
  mayUseLongitudinalEvidence: boolean;
  reason: string;
}

// Educational Mode: "accessible without NHEI persistence or longitudinal-
// tracking consent... must not persist sensitive personal evidence." No
// consent check gates whether it can run at all - only whether it may
// persist (never, by definition of this mode).
function authoriseEducational(): NheiModeAuthorisation {
  return {
    mode: 'educational', allowed: true, mayPersist: false, mayUseLongitudinalEvidence: false,
    reason: 'Educational Mode is always accessible and never persists evidence.',
  };
}

// Personal Reflection Mode: can always RUN (explore the current
// conversation), but persisting what it finds requires reflection_storage
// consent specifically. Running without that consent still works - the
// extraction/interpretation this turn simply cannot be saved afterward.
function authorisePersonalReflection(consent: NheiConsentState): NheiModeAuthorisation {
  const consented = isNheiPurposeConsented(consent, 'reflection_storage');
  return {
    mode: 'personal_reflection', allowed: true, mayPersist: consented, mayUseLongitudinalEvidence: false,
    reason: consented
      ? 'reflection_storage is consented - this turn\'s evidence may be persisted.'
      : 'reflection_storage is not consented - this turn may be explored but nothing may be persisted afterward.',
  };
}

// Longitudinal Mode: "requires provenance, valid consent and appropriate
// evidence thresholds... do not infer recurrence when no reliable
// previous records are available." Both consent purposes are required -
// reading prior evidence at all requires reflection_storage (it's still
// evidence-reading), and treating it as a LONGITUDINAL pattern requires
// longitudinal_tracking specifically, matching exactly how
// nhei-persistence-service.ts's readNheiTemporalView already gates
// persisted influence relations. This mode is refused outright (not
// silently downgraded to Educational) when consent is missing, so a
// caller cannot accidentally run longitudinal reasoning while believing
// it was authorised.
function authoriseLongitudinal(consent: NheiConsentState): NheiModeAuthorisation {
  const hasReflection = isNheiPurposeConsented(consent, 'reflection_storage');
  const hasLongitudinal = isNheiPurposeConsented(consent, 'longitudinal_tracking');
  const allowed = hasReflection && hasLongitudinal;
  return {
    mode: 'longitudinal', allowed, mayPersist: allowed, mayUseLongitudinalEvidence: allowed,
    reason: allowed
      ? 'reflection_storage and longitudinal_tracking are both consented.'
      : 'Longitudinal Mode requires BOTH reflection_storage and longitudinal_tracking consent; at least one is missing.',
  };
}

export function authoriseConversationMode(consent: NheiConsentState, requestedMode: NheiConversationMode): NheiModeAuthorisation {
  switch (requestedMode) {
    case 'educational': return authoriseEducational();
    case 'personal_reflection': return authorisePersonalReflection(consent);
    case 'longitudinal': return authoriseLongitudinal(consent);
  }
}

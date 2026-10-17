// NHEI PHASE 2 - PURPOSE-BASED CONSENT
//
// Three independently enforceable consent purposes, per the Phase 2
// approval spec (section 4):
//   * reflection_storage    - persisting Trifecta/Dimensions-tagged
//                              evidence at all, for the user's own
//                              personalised reflection.
//   * longitudinal_tracking - persisting anything that depends on
//                              evidence accumulating over time: asserted
//                              influence relations, and correction
//                              history on a disputed interpretation.
//   * routing_insights      - future use of confirmed NHEI insights in
//                              Recovery Routing. Nothing in Phase 2 reads
//                              this flag yet (Recovery Routing is not
//                              touched at all in Phase 2) - it exists now
//                              so the three purposes can be designed
//                              together, as the spec asks for, rather than
//                              bolting a third flag on later.
//
// General education about the framework (e.g. a future Knowledge Service
// article) never requires any of these - none of them gate reading
// educational content, only persisting or using the user's own evidence.
//
// Deliberately FAIL-CLOSED: every other consent-style flag in
// nova-brain.ts (allowFingerprint, allowCalendarSignals, etc.) fails OPEN
// on a missing doc or a read error, because those gate low-sensitivity,
// already-default-on categories. NHEI is the opposite: "default all new
// persistence and inference-sharing permissions to false" is explicit in
// the approval spec, so a missing field, a missing doc, or a read error
// must all resolve to "not consented," never "consented by default."

export type NheiConsentPurpose = 'reflection_storage' | 'longitudinal_tracking' | 'routing_insights';

export const NHEI_CONSENT_PURPOSES: readonly NheiConsentPurpose[] = [
  'reflection_storage',
  'longitudinal_tracking',
  'routing_insights',
];

export const isValidNheiConsentPurpose = (value: unknown): value is NheiConsentPurpose =>
  typeof value === 'string' && (NHEI_CONSENT_PURPOSES as readonly string[]).includes(value);

// The exact field names this purpose maps to on the existing
// users/{uid}/nova_permissions/current document - reusing that document's
// conventions rather than introducing a separate consent collection, per
// "Prefer existing nova_permissions... conventions."
export const NHEI_CONSENT_FIELD: Record<NheiConsentPurpose, string> = {
  reflection_storage: 'allowNheiReflectionStorage',
  longitudinal_tracking: 'allowNheiLongitudinalTracking',
  routing_insights: 'allowNheiRoutingInsights',
};

export interface NheiConsentState {
  reflection_storage: boolean;
  longitudinal_tracking: boolean;
  routing_insights: boolean;
}

export const NHEI_CONSENT_DEFAULTS: NheiConsentState = {
  reflection_storage: false,
  longitudinal_tracking: false,
  routing_insights: false,
};

// Pure projection from an already-fetched nova_permissions document body
// (or undefined, for "no doc exists") to NHEI's consent state. Takes the
// data, not a Firestore reference, so this is testable with a plain
// object and carries no I/O - the actual document read lives in
// nhei-persistence-service.ts.
export function deriveNheiConsentState(permissionsDocData: Record<string, unknown> | undefined): NheiConsentState {
  if (!permissionsDocData) return { ...NHEI_CONSENT_DEFAULTS };
  const state = { ...NHEI_CONSENT_DEFAULTS };
  for (const purpose of NHEI_CONSENT_PURPOSES) {
    const field = NHEI_CONSENT_FIELD[purpose];
    const value = permissionsDocData[field];
    state[purpose] = value === true; // anything other than a literal true is "not consented"
  }
  return state;
}

export const isNheiPurposeConsented = (state: NheiConsentState, purpose: NheiConsentPurpose): boolean =>
  state[purpose] === true;

// "General educational conversations must remain available without
// enabling longitudinal tracking" - a pure statement of that rule, so
// nothing downstream has to re-derive it: education is never gated by any
// NHEI consent purpose at all.
export const NHEI_EDUCATION_REQUIRES_CONSENT = false;

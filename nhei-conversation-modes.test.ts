import { describe, it, expect } from 'vitest';
import { authoriseConversationMode, isValidNheiConversationMode, NHEI_CONVERSATION_MODES } from './nhei-conversation-modes';
import { type NheiConsentState } from './nhei-consent';

const NO_CONSENT: NheiConsentState = { reflection_storage: false, longitudinal_tracking: false, routing_insights: false };
const REFLECTION_ONLY: NheiConsentState = { reflection_storage: true, longitudinal_tracking: false, routing_insights: false };
const BOTH: NheiConsentState = { reflection_storage: true, longitudinal_tracking: true, routing_insights: false };
const LONGITUDINAL_ONLY: NheiConsentState = { reflection_storage: false, longitudinal_tracking: true, routing_insights: false };

describe('Educational Mode - always accessible, never persists', () => {
  it('is allowed with no consent at all', () => {
    const auth = authoriseConversationMode(NO_CONSENT, 'educational');
    expect(auth.allowed).toBe(true);
    expect(auth.mayPersist).toBe(false);
    expect(auth.mayUseLongitudinalEvidence).toBe(false);
  });

  it('is allowed even with full consent - consent is irrelevant to this mode', () => {
    const auth = authoriseConversationMode(BOTH, 'educational');
    expect(auth.allowed).toBe(true);
    expect(auth.mayPersist).toBe(false);
  });
});

describe('Personal Reflection Mode - always runs, persistence requires reflection_storage', () => {
  it('runs but may not persist without reflection_storage consent', () => {
    const auth = authoriseConversationMode(NO_CONSENT, 'personal_reflection');
    expect(auth.allowed).toBe(true);
    expect(auth.mayPersist).toBe(false);
  });

  it('may persist once reflection_storage is consented', () => {
    const auth = authoriseConversationMode(REFLECTION_ONLY, 'personal_reflection');
    expect(auth.allowed).toBe(true);
    expect(auth.mayPersist).toBe(true);
  });

  it('never uses longitudinal evidence, regardless of consent', () => {
    expect(authoriseConversationMode(BOTH, 'personal_reflection').mayUseLongitudinalEvidence).toBe(false);
  });
});

describe('Longitudinal Mode - requires BOTH consent purposes, refused outright otherwise', () => {
  it('is refused with no consent', () => {
    const auth = authoriseConversationMode(NO_CONSENT, 'longitudinal');
    expect(auth.allowed).toBe(false);
    expect(auth.mayUseLongitudinalEvidence).toBe(false);
  });

  it('is refused with only reflection_storage consent', () => {
    expect(authoriseConversationMode(REFLECTION_ONLY, 'longitudinal').allowed).toBe(false);
  });

  it('is refused with only longitudinal_tracking consent (reflection_storage missing)', () => {
    expect(authoriseConversationMode(LONGITUDINAL_ONLY, 'longitudinal').allowed).toBe(false);
  });

  it('is allowed only with both consents', () => {
    const auth = authoriseConversationMode(BOTH, 'longitudinal');
    expect(auth.allowed).toBe(true);
    expect(auth.mayUseLongitudinalEvidence).toBe(true);
    expect(auth.mayPersist).toBe(true);
  });
});

describe('isValidNheiConversationMode', () => {
  it('accepts the three defined modes and rejects anything else', () => {
    expect(NHEI_CONVERSATION_MODES).toHaveLength(3);
    for (const mode of NHEI_CONVERSATION_MODES) expect(isValidNheiConversationMode(mode)).toBe(true);
    expect(isValidNheiConversationMode('live_diagnosis')).toBe(false);
  });
});

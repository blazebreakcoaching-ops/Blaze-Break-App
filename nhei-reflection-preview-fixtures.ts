// NHEI PHASE 5 - REFLECTION & CORRECTION PREVIEW: SYNTHETIC FIXTURES
// (directive §6)
//
// NheiEvidenceRecord (nhei-types.ts) deliberately has NO raw-text field
// at all - "ids only, never raw content" is a structural guarantee
// elsewhere in this codebase, not a style choice this file can relax.
// But a genuinely useful PREVIEW of what reflection could look like
// needs something readable on screen. The honest way to reconcile
// these: this file defines its own, clearly separate, UI-preview-only
// type (NheiReflectionPreviewEntry) that pairs illustrative, synthetic
// example text with the real taxonomy fields - never claiming this text
// is, or came from, a real evidence record. Every fixture below is
// fabricated for this preview; none represents a real user, a real
// conversation, or real evidence of any kind.
//
// Distinguishes exactly what directive §6 asked for:
//   - what the person reported (reportedText)
//   - Nova's tentative interpretation (novaTentativeInterpretation, only
//     on SYSTEM_HYPOTHESIS-shaped entries)
//   - user-confirmed information (confirmationState: 'confirmed')
//   - unconfirmed hypotheses (confirmationState: 'hypothesis')
//   - chronological observations and separate episodes (episodeId +
//     chronologyLabel)
//   - relevant Three Selves and Four Dimensions (selfSystems, dimensions)
//
// Never diagnoses, never assigns an unsupported trait, never asserts a
// third party's private beliefs, never presents a hypothesis as a fact -
// see each fixture's own novaTentativeInterpretation/confirmationState
// pairing below for how that distinction is kept visible.
//
// OFFLINE AT THIS PHASE: imported only by the preview component and its
// own test - never by server.ts, any route, or real evidence code.

import type { SelfSystem, Dimension } from './nhei-types';

export interface NheiReflectionPreviewEntry {
  id: string;
  episodeId: string;
  chronologyLabel: string; // e.g. "First mentioned" / "Three days later" - illustrative only
  // What the person is shown as having said, in their own words - purely
  // illustrative text for this preview, never real.
  reportedText: string;
  confirmationState: 'confirmed' | 'hypothesis' | 'disputed';
  // Only present when confirmationState === 'hypothesis' - Nova's own
  // tentative read, explicitly never shown as if it were the person's
  // own statement.
  novaTentativeInterpretation: string | null;
  selfSystems: SelfSystem[];
  dimensions: Dimension[];
}

export interface NheiReflectionPreviewEpisode {
  episodeId: string;
  label: string;
  entries: NheiReflectionPreviewEntry[];
}

// A small, deliberately varied synthetic set: two separate episodes
// (never conflated), one user-confirmed entry, one open hypothesis, one
// disputed entry (to show a correction actually changes what's
// displayed) - spanning more than one Self/Dimension so the preview
// demonstrates real plurality, not a single flat list.
export const NHEI_REFLECTION_PREVIEW_FIXTURES: NheiReflectionPreviewEpisode[] = [
  {
    episodeId: 'episode_1',
    label: 'A conversation about taking leave',
    entries: [
      {
        id: 'entry_1',
        episodeId: 'episode_1',
        chronologyLabel: 'First mentioned',
        reportedText: 'I asked for the time off expecting to be told no.',
        confirmationState: 'confirmed',
        novaTentativeInterpretation: null,
        selfSystems: ['PERCEIVED_RECEIVED_SELF'],
        dimensions: ['MENTAL'],
      },
      {
        id: 'entry_2',
        episodeId: 'episode_1',
        chronologyLabel: 'Later the same conversation',
        reportedText: 'It got approved, but I still felt tense about it.',
        confirmationState: 'hypothesis',
        novaTentativeInterpretation: 'This might be connected to how surprising the approval felt, but that’s Nova’s guess, not something you’ve confirmed.',
        selfSystems: ['INTERNAL_SELF'],
        dimensions: ['EMOTIONAL'],
      },
    ],
  },
  {
    episodeId: 'episode_2',
    label: 'A separate, later check-in',
    entries: [
      {
        id: 'entry_3',
        episodeId: 'episode_2',
        chronologyLabel: 'A few days later',
        reportedText: 'Similar thing happened again when a different request got approved.',
        confirmationState: 'hypothesis',
        novaTentativeInterpretation: 'This is the second time a similar pattern has come up - that’s a real repeat, not a guess about why it happens.',
        selfSystems: ['PERCEIVED_RECEIVED_SELF', 'INTERNAL_SELF'],
        dimensions: ['EMOTIONAL'],
      },
      {
        id: 'entry_4',
        episodeId: 'episode_2',
        chronologyLabel: 'Same check-in',
        reportedText: 'I thought it was about feeling guilty, but actually I think it was just tiredness.',
        confirmationState: 'disputed',
        novaTentativeInterpretation: null, // disputed - the earlier hypothesis is withdrawn, never shown as settled
        selfSystems: ['INTERNAL_SELF'],
        dimensions: ['PHYSICAL'],
      },
    ],
  },
];

export function allPreviewEntries(): NheiReflectionPreviewEntry[] {
  return NHEI_REFLECTION_PREVIEW_FIXTURES.flatMap((ep) => ep.entries);
}

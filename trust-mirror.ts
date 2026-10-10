// Employee Trust Mirror (Work Design Pulse PR2) - pure logic, no I/O, same
// pattern as org-rbac.ts/org-leading-indicators.ts. Computes what an
// organisation can and cannot see from REAL active configuration, never a
// static marketing-style promise. The "cannot see" list is architectural,
// not configurable: nothing in server.ts's org-facing routes ever reads
// from the collections it names (Nova conversations, journal, mood, body
// check-ins, Anxiety Check-ins, Support Circle, Recovery Ally, goals,
// Action Engine experiments, Trigger reflections, Energy Delta, Recovery
// Direction) - so it is always true regardless of org settings, and is
// listed as a fixed fact rather than derived from anything per-org.
//
// The "can see" list IS derived: a category only appears as currently
// active if the real feature it depends on is actually in use for this
// org, never just because the product theoretically supports it. Each
// entry says which real signal/feature backs it, so this can never
// silently drift into a hardcoded promise again.

export interface TrustMirrorInput {
  // Whether at least one consenting member in this org has a fresh,
  // permissioned calendar connection (same definition as
  // isCalendarConnectedAndFresh/computeMeetingLoadSnapshotForCohort).
  calendarSignalInUse: boolean;
  // Whether the org has ever received an Anonymous Team Voice submission.
  teamVoiceInUse: boolean;
  // Whether the org has at least one Work Design Intervention on record.
  interventionsInUse: boolean;
}

export interface TrustMirrorCategory {
  key: string;
  label: string;
  active: boolean;
  // Honest explanation of why this is or isn't currently active -
  // never silent about the real reason.
  basis: string;
}

export const computeTrustMirrorCanSee = (input: TrustMirrorInput): TrustMirrorCategory[] => [
  {
    key: 'meeting_pressure',
    label: 'Aggregate meeting-pressure patterns',
    active: input.calendarSignalInUse,
    basis: input.calendarSignalInUse
      ? 'At least one consenting teammate has connected a calendar.'
      : 'No consenting teammate has connected a calendar yet - not currently used in your organisation.',
  },
  {
    key: 'team_voice',
    label: 'Anonymous Team Voice themes (grouped, never attributed to you)',
    active: input.teamVoiceInUse,
    basis: input.teamVoiceInUse
      ? 'Your organisation has received anonymous submissions.'
      : "Nobody has submitted to Anonymous Team Voice yet - there's nothing to group.",
  },
  {
    key: 'intervention_outcomes',
    label: 'Work-design intervention outcomes your organisation has tried',
    active: input.interventionsInUse,
    basis: input.interventionsInUse
      ? 'Your organisation has at least one recorded work-design intervention.'
      : 'Your organisation has not started any work-design intervention yet.',
  },
];

// Fixed, architectural - never computed from org settings because no org
// setting could ever turn these on. Always shown as fully protected.
export const TRUST_MIRROR_CANNOT_SEE: string[] = [
  'Your Nova conversations',
  'Your journal',
  'Your mood and body check-ins',
  'Your Anxiety Check-ins',
  'Your personal Recovery Direction',
  'Your Energy Delta',
  'Your Support Circle',
  'Your Recovery Ally messages',
  'Your personal goals',
  'Your private Action Engine experiments',
  'Your private Trigger reflections',
];

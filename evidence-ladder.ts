// Evidence Ladder + "What Works Here" (Work Design Pulse PR8) - a 7-level
// scale for how strongly an organisation's own recorded history supports
// a given structural change actually working, computed entirely from real
// work_design_interventions records (never invented, never borrowed from
// another organisation's data). Pure logic only (no Firestore, no React).
//
// The first six levels are always computed, never set by a human - the
// same "no data != zero" discipline as the rest of this codebase. Only
// the seventh, ceiling level - Local Operating Principle - is a deliberate
// human judgment call an org admin makes after reviewing the evidence;
// nothing here ever promotes a pattern to that level automatically, since
// that would turn a genuine human endorsement into something that looks
// like one but isn't.

export const EVIDENCE_LEVELS = [
  'no_evidence',
  'single_report',
  'single_report_no_transfer',
  'repeated_one_team',
  'repeated_across_teams',
  'consistent_no_transfer',
  'local_operating_principle',
] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  no_evidence: 'No Evidence Yet',
  single_report: 'Single Report',
  single_report_no_transfer: 'Single Report, No Pressure Transfer Detected',
  repeated_one_team: 'Repeated Within One Team',
  repeated_across_teams: 'Repeated Across Teams',
  consistent_no_transfer: 'Consistent Across Teams, No Pressure Transfer Detected',
  local_operating_principle: 'Local Operating Principle',
};

export interface EvidenceRecord {
  team: string;
  outcomeRating: 'useful' | 'partly_useful' | 'no_clear_difference' | 'created_another_problem' | 'stopped_early' | null;
  // Whether this specific trial's own Pressure Transfer Detector check
  // (pressure-transfer-detector.ts) found anything - never assumed false
  // just because it wasn't computed; the caller passes the real result.
  pressureTransferDetected: boolean;
}

// Computes the highest of the six real, derivable levels - never returns
// 'local_operating_principle', which only a human promotion can set (see
// server.ts's promote route). A record only counts toward this at all if
// its own outcome was positive ("useful" or "partly_useful") - a mixed or
// negative history never climbs the ladder just because a trial happened.
export const computeEvidenceLevel = (records: EvidenceRecord[]): EvidenceLevel => {
  const positive = records.filter((r) => r.outcomeRating === 'useful' || r.outcomeRating === 'partly_useful');
  if (positive.length === 0) return 'no_evidence';

  const distinctTeams = new Set(positive.map((r) => r.team));
  const noneTransferred = positive.every((r) => !r.pressureTransferDetected);

  if (positive.length === 1) {
    return noneTransferred ? 'single_report_no_transfer' : 'single_report';
  }
  if (distinctTeams.size === 1) {
    return 'repeated_one_team';
  }
  return noneTransferred ? 'consistent_no_transfer' : 'repeated_across_teams';
};

export const evidenceLevelRank = (level: EvidenceLevel): number => EVIDENCE_LEVELS.indexOf(level);

// A pattern can only be promoted once its real, computed evidence has
// reached at least "repeated across teams" - an admin's endorsement still
// has to point at something with actual breadth behind it, not a single
// team's one good week.
export const MIN_RANK_FOR_PROMOTION = evidenceLevelRank('repeated_across_teams');

export const canPromoteToLocalOperatingPrinciple = (computedLevel: EvidenceLevel): boolean =>
  evidenceLevelRank(computedLevel) >= MIN_RANK_FOR_PROMOTION;

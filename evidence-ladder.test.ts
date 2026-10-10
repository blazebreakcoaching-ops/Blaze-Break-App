import { describe, it, expect } from 'vitest';
import {
  computeEvidenceLevel, evidenceLevelRank, canPromoteToLocalOperatingPrinciple,
  EVIDENCE_LEVELS, EVIDENCE_LEVEL_LABELS,
} from './evidence-ladder';

describe('EVIDENCE_LEVELS', () => {
  it('has exactly 7 levels, ending at local_operating_principle', () => {
    expect(EVIDENCE_LEVELS).toHaveLength(7);
    expect(EVIDENCE_LEVELS[EVIDENCE_LEVELS.length - 1]).toBe('local_operating_principle');
  });

  it('every level has a plain-language label', () => {
    for (const level of EVIDENCE_LEVELS) expect(EVIDENCE_LEVEL_LABELS[level]).toBeTruthy();
  });
});

describe('computeEvidenceLevel', () => {
  it('returns no_evidence for an empty record set', () => {
    expect(computeEvidenceLevel([])).toBe('no_evidence');
  });

  it('returns no_evidence when every record was negative or inconclusive', () => {
    const records = [
      { team: 'Team A', outcomeRating: 'no_clear_difference' as const, pressureTransferDetected: false },
      { team: 'Team B', outcomeRating: 'created_another_problem' as const, pressureTransferDetected: false },
    ];
    expect(computeEvidenceLevel(records)).toBe('no_evidence');
  });

  it('returns no_evidence when no outcome has been recorded yet', () => {
    expect(computeEvidenceLevel([{ team: 'Team A', outcomeRating: null, pressureTransferDetected: false }])).toBe('no_evidence');
  });

  it('returns single_report for exactly one positive record with a pressure transfer detected', () => {
    const records = [{ team: 'Team A', outcomeRating: 'useful' as const, pressureTransferDetected: true }];
    expect(computeEvidenceLevel(records)).toBe('single_report');
  });

  it('returns single_report_no_transfer for exactly one positive record with no transfer detected', () => {
    const records = [{ team: 'Team A', outcomeRating: 'partly_useful' as const, pressureTransferDetected: false }];
    expect(computeEvidenceLevel(records)).toBe('single_report_no_transfer');
  });

  it('returns repeated_one_team for two positive records from the same team', () => {
    const records = [
      { team: 'Team A', outcomeRating: 'useful' as const, pressureTransferDetected: false },
      { team: 'Team A', outcomeRating: 'useful' as const, pressureTransferDetected: true },
    ];
    expect(computeEvidenceLevel(records)).toBe('repeated_one_team');
  });

  it('returns repeated_across_teams for positive records from multiple teams, with a transfer detected in at least one', () => {
    const records = [
      { team: 'Team A', outcomeRating: 'useful' as const, pressureTransferDetected: true },
      { team: 'Team B', outcomeRating: 'useful' as const, pressureTransferDetected: false },
    ];
    expect(computeEvidenceLevel(records)).toBe('repeated_across_teams');
  });

  it('returns consistent_no_transfer for positive records from multiple teams, none with a transfer detected', () => {
    const records = [
      { team: 'Team A', outcomeRating: 'useful' as const, pressureTransferDetected: false },
      { team: 'Team B', outcomeRating: 'partly_useful' as const, pressureTransferDetected: false },
      { team: 'Team C', outcomeRating: 'useful' as const, pressureTransferDetected: false },
    ];
    expect(computeEvidenceLevel(records)).toBe('consistent_no_transfer');
  });

  it('ignores negative records mixed in with positive ones when counting teams', () => {
    const records = [
      { team: 'Team A', outcomeRating: 'useful' as const, pressureTransferDetected: false },
      { team: 'Team B', outcomeRating: 'stopped_early' as const, pressureTransferDetected: false },
    ];
    expect(computeEvidenceLevel(records)).toBe('single_report_no_transfer');
  });

  it('never returns local_operating_principle - that level is human-only', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({ team: `Team ${i}`, outcomeRating: 'useful' as const, pressureTransferDetected: false }));
    expect(computeEvidenceLevel(records)).not.toBe('local_operating_principle');
  });
});

describe('evidenceLevelRank / canPromoteToLocalOperatingPrinciple', () => {
  it('ranks levels in ascending ladder order', () => {
    expect(evidenceLevelRank('no_evidence')).toBeLessThan(evidenceLevelRank('single_report'));
    expect(evidenceLevelRank('single_report')).toBeLessThan(evidenceLevelRank('repeated_one_team'));
    expect(evidenceLevelRank('repeated_across_teams')).toBeLessThan(evidenceLevelRank('local_operating_principle'));
  });

  it('refuses promotion below repeated_across_teams', () => {
    expect(canPromoteToLocalOperatingPrinciple('no_evidence')).toBe(false);
    expect(canPromoteToLocalOperatingPrinciple('single_report')).toBe(false);
    expect(canPromoteToLocalOperatingPrinciple('repeated_one_team')).toBe(false);
  });

  it('allows promotion at repeated_across_teams and above', () => {
    expect(canPromoteToLocalOperatingPrinciple('repeated_across_teams')).toBe(true);
    expect(canPromoteToLocalOperatingPrinciple('consistent_no_transfer')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { formatDataProvenance } from './data-provenance';

describe('formatDataProvenance', () => {
  it('formats a full label with every field present', () => {
    const label = formatDataProvenance({ source: 'work_design_interventions', windowDays: 90, coveragePercent: 80, privacyGatePassed: true });
    expect(label).toBe('Derived from work_design_interventions · Last 90 days · Coverage: 80% · Privacy Gate: Passed');
  });

  it('shows "Live snapshot" when there is no real time window', () => {
    const label = formatDataProvenance({ source: 'work_design_debt', windowDays: null, coveragePercent: null, privacyGatePassed: true });
    expect(label).toContain('Live snapshot');
  });

  it('shows "Coverage: not applicable" when coverage is not a meaningful concept here', () => {
    const label = formatDataProvenance({ source: 'work_design_debt', windowDays: null, coveragePercent: null, privacyGatePassed: true });
    expect(label).toContain('Coverage: not applicable');
  });

  it('reports Privacy Gate: Insufficient when the gate was not actually passed', () => {
    const label = formatDataProvenance({ source: 'meeting_pressure', windowDays: 28, coveragePercent: 40, privacyGatePassed: false });
    expect(label).toContain('Privacy Gate: Insufficient');
  });

  it('reports the gate as not applicable for a figure with no personal data behind it, rather than claiming a check ran', () => {
    const label = formatDataProvenance({ source: 'work_design_debt', windowDays: null, coveragePercent: null, privacyGatePassed: null });
    expect(label).toContain('Privacy Gate: Not Applicable');
    expect(label).not.toContain('Passed');
  });
});

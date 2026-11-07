import { describe, it, expect } from 'vitest';
import { buildExecutiveReportHtml, escapeHtml, ExecutiveReportInput } from './executive-report-document';

const base = (overrides: Partial<ExecutiveReportInput> = {}): ExecutiveReportInput => ({
  name: 'Alex Morgan',
  role: 'COO',
  organisation: 'Northwind',
  points: 120,
  streak: 4,
  generatedAt: new Date('2026-11-07T12:00:00Z'),
  data: { deepWorkHours: 6, boundariesProtected: 3, burnRatePercent: 72, sleepDebtHours: 2, aiAnalysis: 'Steady week.' },
  includeAICommentary: true,
  includeMetricsGrid: true,
  includeBurnRate: true,
  includeCorporateSignature: true,
  ...overrides,
});

describe('executive report document', () => {
  it('escapes markup in profile fields and AI analysis (no script execution)', () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const html = buildExecutiveReportHtml(base({
      name: hostile, role: hostile, organisation: hostile,
      data: { deepWorkHours: 1, boundariesProtected: 1, burnRatePercent: 1, sleepDebtHours: 1, aiAnalysis: hostile },
    }));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('contains no script at all, even for ordinary input', () => {
    expect(buildExecutiveReportHtml(base())).not.toMatch(/<script/i);
  });

  it('makes no unsupported security or authorship claims', () => {
    const html = buildExecutiveReportHtml(base());
    expect(html).not.toMatch(/SSL|Cryptographic|ai\.studio|SECURED CONFIGURATION|Recovery Strategist/i);
    expect(html).toContain('Not a medical or clinical assessment');
  });

  it('uses UK date format and real values', () => {
    const html = buildExecutiveReportHtml(base());
    expect(html).toContain('7 November 2026');
    expect(html).toContain('72%');
    expect(html).toContain('6 hrs');
  });

  it('is honest when there is no data yet', () => {
    const html = buildExecutiveReportHtml(base({ data: null }));
    expect(html).toContain('No data yet');
    expect(html).toContain('Not enough activity has been logged yet');
  });

  it('omits sections the user turned off', () => {
    const html = buildExecutiveReportHtml(base({ includeAICommentary: false, includeMetricsGrid: false }));
    expect(html).not.toContain('Nova Core AI Analysis');
    expect(html).not.toContain('Weekly Recovery Metrics');
  });

  it('escapeHtml covers all five significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(escapeHtml(null)).toBe('');
  });
});
